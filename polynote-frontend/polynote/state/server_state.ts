import {Disposable, StateHandler, StateView} from "./state_handler";
import {ServerErrorWithCause} from "../data/result";
import {Identity} from "../data/messages";
import {NotebookStateHandler} from "./notebook_state";
import {SocketSession} from "../messaging/comms";
import {NotebookMessageReceiver} from "../messaging/receiver";
import {
    CloseNotebook,
    NotebookMessageDispatcher,
    Reconnect
} from "../messaging/dispatcher";
import {SocketStateHandler} from "./socket_state";
import {NotebookConfig, SparkPropertySet} from "../data/data";
import {removeKey} from "../util/helpers";
import {EditBuffer} from "../data/edit_buffer";

export type NotebookInfo = {
    handler: NotebookStateHandler,
    loaded: boolean,
    info?: {
        receiver: NotebookMessageReceiver,
        dispatcher: NotebookMessageDispatcher
    }
};

export type ServerError = { err: ServerErrorWithCause, code?: number };

export interface ServerState {
    errors: ServerError[],
    // Keys are notebook path. Values denote whether the notebook has ever been loaded in this session.
    notebooks: Record<string, NotebookInfo["loaded"]>,
    connectionStatus: "connected" | "disconnected",
    interpreters: Record<string, string>,
    serverVersion: string,
    serverCommit: string,
    identity: Identity,
    sparkTemplates: SparkPropertySet[]
    // ephemeral states
    currentNotebook?: string,
    openNotebooks: string[]
}

export class ServerStateHandler extends StateHandler<ServerState> {
    private static notebooks: Record<string, NotebookInfo> = {};

    private constructor(state: ServerState) {
        super(state);
    }

    private static inst: ServerStateHandler;
    static get get() {
        if (!ServerStateHandler.inst) {
            ServerStateHandler.inst = new ServerStateHandler({
                errors: [],
                notebooks: {},
                connectionStatus: "disconnected",
                interpreters: {},
                serverVersion: "unknown",
                serverCommit: "unknown",
                identity: new Identity("Unknown User", null),
                sparkTemplates: [],
                currentNotebook: undefined,
                openNotebooks: []
            })
        }
        return ServerStateHandler.inst;
    }

    /**
     * Create a temporary view into the ServerState.
     *
     * Since ServerStateHandler is a singleton, callers are required to provide a Disposable to clean up unneeded Views.
     * If the view will never be cleaned up, use `ServerStateHandler.get.view` instead.
     *
     * @param key
     * @param disposeWhen
     */
    static view<T extends keyof ServerState>(key: T, disposeWhen: Disposable): StateView<ServerState[T]> {
        return ServerStateHandler.get.view(key, undefined, disposeWhen)
    }

    /**
     * Convenience method to get the state.
     */
    static get state(): ServerState {
        return ServerStateHandler.get.state;
    }

    // only for testing
    static clear() {
        if (ServerStateHandler.inst) {
            ServerStateHandler.inst.clearObservers();
            ServerStateHandler.inst.dispose()

            ServerStateHandler.inst = new ServerStateHandler({
                errors: [],
                notebooks: {},
                connectionStatus: "disconnected",
                interpreters: {},
                serverVersion: "unknown",
                serverCommit: "unknown",
                identity: new Identity("Unknown User", null),
                sparkTemplates: [],
                currentNotebook: undefined,
                openNotebooks: []
            })
        }
    }

    static loadNotebook(path: string): NotebookInfo {
        const nbInfo = ServerStateHandler.getOrCreateNotebook(path)
        const loaded =  nbInfo?.info;
        if (loaded) {
            return nbInfo
        } else {
            // Note: the server will start sending notebook data on this socket automatically after it connects
            const nbSocket = new SocketStateHandler(SocketSession.fromRelativeURL(`ws/${encodeURIComponent(path)}`));
            const receiver = new NotebookMessageReceiver(nbSocket, nbInfo.handler);
            const dispatcher = new NotebookMessageDispatcher(nbSocket, nbInfo.handler)
            nbInfo.info = {receiver, dispatcher};
            nbInfo.loaded = true;
            ServerStateHandler.notebooks[path] = nbInfo;
            return nbInfo
        }
    }

    static getNotebook(path: string): NotebookInfo | undefined {
        return ServerStateHandler.notebooks[path]
    }

    /**
     * Initialize a new NotebookState and create a NotebookMessageReceiver for that notebook.
     */
    static getOrCreateNotebook(path: string): NotebookInfo {
        const maybeExists = ServerStateHandler.notebooks[path]
        if (maybeExists) {
            return maybeExists
        } else {
            const nbInfo = {
                handler: new NotebookStateHandler({
                    path,
                    cells: [],
                    config: {open: false, config: NotebookConfig.default},
                    errors: [],
                    kernel: {
                        symbols: [],
                        status: ServerStateHandler.state.connectionStatus === "connected" ? 'dead' : 'disconnected',
                        info: {},
                        tasks: {},
                    },
                    globalVersion: -1,
                    localVersion: -1,
                    editBuffer: new EditBuffer(),
                    activePresence: {},
                    activeStreams: {}
                }),
                loaded: false,
                info: undefined,
            }

            ServerStateHandler.notebooks[path] = nbInfo;
            return nbInfo
        }
    }

    static renameNotebook(oldPath: string, newPath: string) {
        const nbInfo = ServerStateHandler.notebooks[oldPath]
        if (nbInfo) {
            // update the path in the notebook's handler
            nbInfo.handler.updateState(nbState => {
                return {
                    ...nbState,
                    path: newPath
                }
            })
            // update our notebooks dictionary
            ServerStateHandler.notebooks[newPath] = nbInfo
            delete ServerStateHandler.notebooks[oldPath]

            // update the server state's notebook dictionary
            ServerStateHandler.get.updateState(s => {
                const prev = s.notebooks[oldPath]
                return {
                    ...s,
                    notebooks: {
                        ...removeKey(s.notebooks, oldPath),
                        [newPath]: prev
                    }
                }
            })
        }
    }

    static deleteNotebook(path: string) {
        ServerStateHandler.closeNotebook(path)

        // update our notebooks dictionary
        delete ServerStateHandler.notebooks[path]

        // update the server state's notebook dictionary
        ServerStateHandler.get.updateState(s => {
            return {
                ...s,
                notebooks: {
                    ...removeKey(s.notebooks, path),
                }
            }
        })
    }

    static closeNotebook(path: string) {
        const maybeNb = ServerStateHandler.notebooks[path];
        if (maybeNb) {
            maybeNb.handler.dispose()
            maybeNb.info?.dispatcher.dispatch(new CloseNotebook(path))

            // reset the entry for this notebook.
            delete ServerStateHandler.notebooks[path]
            ServerStateHandler.getOrCreateNotebook(path)
        }
    }

    static reconnectNotebooks(onlyIfClosed: boolean) {
        Object.entries(ServerStateHandler.notebooks).forEach(([path, notebook]) => {
            if (notebook.loaded && notebook.info) {
                notebook.info.dispatcher.dispatch(new Reconnect(onlyIfClosed))
            }
        })
    }

    static get openNotebooks(): [string, NotebookInfo][] {
        return Object.entries(ServerStateHandler.notebooks).reduce<[string, NotebookInfo][]>((acc, [path, info]) => {
            if (info.loaded) {
                return [...acc, [path, info]]
            } else if (info.handler.state.kernel.status !== "disconnected") {
                return [...acc, [path, info]]
            } else return acc
        }, [])
    }
}

