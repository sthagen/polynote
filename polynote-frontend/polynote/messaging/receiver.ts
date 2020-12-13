/**
 * The MessageReceiver is used to translate external events into state changes.
 * So far, the only external events are socket messages.
 */
import {CellState, NotebookState, NotebookStateHandler} from "../state/notebook_state";
import {ServerState, ServerStateHandler} from "../state/server_state";
import * as messages from "../data/messages";
import {Identity, Message, TaskInfo, TaskStatus} from "../data/messages";
import {CellComment, CellMetadata, NotebookCell, NotebookConfig} from "../data/data";
import {purematch} from "../util/match";
import {ContentEdit} from "../data/content_edit";
import {
    ClearResults,
    ClientResult,
    CompileErrors,
    ExecutionInfo,
    Output,
    PosRange,
    Result,
    ResultValue,
    RuntimeError
} from "../data/result";
import {NoUpdate, StateHandler} from "../state/state_handler";
import {SocketStateHandler} from "../state/socket_state";
import {arrInsert, unzip} from "../util/helpers";
import {ClientInterpreters} from "../interpreter/client_interpreter";
import {ClientBackup} from "../state/client_backup";

class MessageReceiver<S> {
    constructor(protected socket: SocketStateHandler, protected state: StateHandler<S>) {}

    receive<M extends messages.Message, C extends (new (...args: any[]) => M) & typeof messages.Message>(msgType: C, fn: (state: S, ...args: ConstructorParameters<typeof msgType>) => S | typeof NoUpdate) {
        this.socket.addMessageListener(msgType, (...args: ConstructorParameters<typeof msgType>) => {
            this.state.updateState(s => {
                return fn(s, ...args) ?? NoUpdate
            })
        })
    }

    // Handle a message as if it were received on the wire. Useful for short-circuiting or simulating server messages.
    inject(msg: Message) {
        this.socket.handleMessage(msg)
    }
}

export class NotebookMessageReceiver extends MessageReceiver<NotebookState> {
    constructor(socket: SocketStateHandler, state: NotebookStateHandler) {
        super(socket, state);

        socket.view("status").addObserver(status => {
            if (status === "disconnected") {
                state.updateState(s => {
                    return {
                        ...s,
                        kernel: {
                            ...s.kernel,
                            status: status
                        },
                        cells: s.cells.map(cell => ({
                            ...cell,
                            running: undefined,
                            queued: undefined,
                            currentHighlight: undefined
                        }))
                    }
                })
            } else {
                state.updateState(s => {
                    return {
                        ...s,
                        kernel: {
                            ...s.kernel,
                            status: s.kernel.status === 'disconnected' ? 'dead' : s.kernel.status // we know it can't be disconnected
                        }
                    }
                })
            }
        })

        this.receive(messages.CompletionsAt, (s, cell, offset, completions) => {
            if (s.activeCompletion) {
                s.activeCompletion.resolve({cell, offset, completions});
                return {
                    ...s,
                    activeCompletion: undefined
                }
            } else {
                console.warn("Got completion response but there was no activeCompletion, this is a bit odd.", {cell, offset, completions})
                return NoUpdate
            }
        });
        this.receive(messages.ParametersAt, (s, cell, offset, signatures) => {
            if (s.activeSignature) {
                s.activeSignature.resolve({cell, offset, signatures})
                return {
                    ...s,
                    activeSignature: undefined
                }
            } else {
                console.warn("Got signature response but there was no activeSignature, this is a bit odd.", {cell, offset, signatures})
                return NoUpdate
            }
        });
        this.receive(messages.NotebookVersion, (s, path, serverGlobalVersion) => {
            if (s.globalVersion !== serverGlobalVersion){
                // this means we must have been disconnected for a bit and the server state has changed.
                document.location.reload() // is it ok to trigger the reload here?
            }
            return NoUpdate
        });
        this.receive(messages.NotebookCells, (s: NotebookState, path: string, cells: NotebookCell[], config?: NotebookConfig) => {
            const [cellStates, results] = unzip(cells.map(cell => {
                const cellState = this.cellToState(cell)
                // unfortunately, this can't be an anonymous function if we want TS to correctly narrow the type.
                function isRV(maybe: ResultValue | ClientResult): maybe is ResultValue {
                    return maybe instanceof ResultValue
                }
                const resultsValues = cellState.results.filter(isRV)
                return [cellState, resultsValues]
            }));

            // add this notebook to the backups
            ClientBackup.addNb(path, cells, config)
                // .then(backups => console.log("Added new backup. All backups for this notebook:", backups))
                .catch(err => console.error("Error adding backup", err));

            return {
                ...s,
                path: path,
                cells: cellStates,
                config: {...s.config, config: config ?? NotebookConfig.default},
                kernel: {
                    ...s.kernel,
                    symbols: [...s.kernel.symbols, ...results.flat()]
                }
            }
        });
        this.receive(messages.KernelStatus, (s, update) => {
            return purematch<messages.KernelStatusUpdate, NotebookState | typeof NoUpdate>(update)
                .when(messages.UpdatedTasks, tasks => {
                    const taskMap = tasks.reduce<Record<string, TaskInfo>>((acc, next) => {
                        acc[next.id] = next
                        return acc
                    }, {})
                    return {
                        ...s,
                        kernel: {
                            ...s.kernel,
                            tasks: {...s.kernel.tasks, ...taskMap}
                        }
                    }
                })
                .whenInstance(messages.KernelBusyState, kernelState => {
                    const status = kernelState.asStatus;
                    return {
                        ...s,
                        kernel: {
                            ...s.kernel,
                            status,
                            symbols: status === 'dead' ? [] : s.kernel.symbols
                        }
                    }
                })
                .when(messages.KernelInfo, info => {
                    return {
                        ...s,
                        kernel: {
                            ...s.kernel,
                            info: info
                        },
                        // Getting KernelInfo means we successfully launched a new kernel, so we can clear any old errors lying around.
                        // This seems a bit hacky, maybe there's a better way to clear these errors?
                        errors: []
                    }
                })
                .when(messages.ExecutionStatus, (id, pos) => {
                    return {
                        ...s,
                        cells: s.cells.map(c => {
                            if (c.id === id) {
                                if (pos) {
                                    return {
                                        ...c,
                                        currentHighlight: { range: pos, className: "currently-executing" }
                                    }
                                } else {
                                    return {
                                        ...c,
                                        currentHighlight: undefined
                                    }
                                }
                            } else return c
                        })
                    }
                })
                .when(messages.PresenceUpdate, (added, removed) => {
                    const activePresence = {...s.activePresence}
                    added.forEach(p => {
                        if (activePresence[p.id] === undefined) {
                            const color = Object.keys(activePresence).length % 8;
                            activePresence[p.id] = {id: p.id, name: p.name, color: `presence${color}`, avatar: p.avatar}
                        }
                    });
                    removed.forEach(id => delete activePresence[id]);

                    return {
                        ...s,
                        activePresence: activePresence
                    }
                })
                .when(messages.PresenceSelection, (id, cellId, range) => {
                    const maybePresence = s.activePresence[id]
                    if (maybePresence) {
                        return {
                            ...s,
                            activePresence: {
                                ...s.activePresence,
                                [id]: {
                                    ...maybePresence,
                                    selection: {cellId, range}
                                }
                            },
                            cells: s.cells.map(cell => {
                                if (cell.id === cellId) {
                                    return {
                                        ...cell,
                                        presence: [...cell.presence, {
                                            id: maybePresence.id,
                                            name: maybePresence.name,
                                            color: maybePresence.color,
                                            range: range
                                        }]
                                    }
                                } else return cell
                            })
                        }
                    } else return NoUpdate
                })
                .when(messages.KernelError, (err) => {
                    return {
                        ...s,
                        errors: [...s.errors, err]
                    }
                })
                .when(messages.CellStatusUpdate, (cellId, status) => {
                    // Special handling for queuing cells: to ensure the correct order in the list, we'll handle creating
                    // the queued task right now.
                    // This is needed because TaskManager.queue both enqueues the cell AND waits until the queue is empty
                    // and the cell is ready to be run. Unfortunately, this means that the backend sends the  Queue Task
                    // AFTER the Queue CellStatusUpdate, and this race condition can mess up the order of tasks on the sidebar.
                    // TODO: rethink how TaskManager.queue works, or figure out some other way to order this deterministically.
                    let kernel = s.kernel;
                    if (status === TaskStatus.Queued) {
                        const taskId = `Cell ${cellId}`;
                        kernel = {
                            ...s.kernel,
                            tasks: {
                                ...s.kernel.tasks,
                                [taskId]: new TaskInfo(taskId, taskId, '', TaskStatus.Queued, 0)
                            }
                        }
                    }

                    return {
                        ...s,
                        cells: s.cells.map(cell => {
                            if (cell.id === cellId) {
                                return {
                                    ...cell,
                                    queued: status === TaskStatus.Queued,
                                    running: status === TaskStatus.Running,
                                    error: status === TaskStatus.Error,
                                }
                            } else return cell
                        }),
                        kernel
                    }
                })
                .otherwiseThrow || NoUpdate
        });
        this.receive(messages.NotebookUpdate, (s: NotebookState, update: messages.NotebookUpdate) => {
            if (update.globalVersion >= s.globalVersion) {
                const globalVersion = update.globalVersion
                const localVersion = s.localVersion + 1

                if (update.localVersion < s.localVersion) {
                    const prevUpdates = s.editBuffer.range(update.localVersion, s.localVersion);
                    update = messages.NotebookUpdate.rebase(update, prevUpdates)
                }

                const res = purematch<messages.NotebookUpdate, NotebookState>(update)
                    .when(messages.UpdateCell, (g, l, id: number, edits: ContentEdit[], metadata?: CellMetadata) => {
                        return {
                            ...s,
                            cells: s.cells.map(c => {
                                if (c.id === id){
                                    return <CellState>{
                                        ...c,
                                        pendingEdits: edits,
                                        metadata: metadata || c.metadata,
                                    }
                                } else return c
                            })
                        }
                    })
                    .when(messages.InsertCell, (g, l, cell: NotebookCell, after: number) => {
                        const newCell = this.cellToState(cell);
                        const insertIdx = s.cells.findIndex(c => c.id === after) + 1;
                        return {
                            ...s,
                            cells: arrInsert(s.cells, insertIdx, newCell)
                        }
                    })
                    .when(messages.DeleteCell, (g, l, id: number) => {
                        const idx = s.cells.findIndex(c => c.id === id);
                        if (idx > -1) {
                            const cells = s.cells.reduce<[CellState[], CellState | null]>(([acc, prev], next, idx) => {
                                // Upon deletion, we want to set the selected cell to be the cell below the deleted one, if present. Otherwise, we want to select the cell above.
                                if (next.id === id) {
                                    if (idx === s.cells.length - 1) {
                                        // deleting the last cell, so try to select the previous cell
                                        const maybePrevious = acc[acc.length - 1];
                                        if (maybePrevious) {
                                            // if the previous cell exists, select it
                                            const selectPrevious: CellState = {...maybePrevious, selected: true}
                                            return [[...acc.slice(0, acc.length - 1), selectPrevious], next]
                                        } else {
                                            // there's no previous cell, which means this is the last cell... nothing to select.
                                            return [acc, next]
                                        }
                                    } else {
                                        // not deleting the last cell. we will select the next cell in the next iteration.
                                        return [acc, next]
                                    }
                                } else if (prev && prev.id === id) {
                                    // the previous cell was deleted, so select this one.
                                    const selectedNext = {...next, selected: true}
                                    return [[...acc, selectedNext], selectedNext]
                                } else {
                                    return [[...acc, next], next]
                                }
                            }, [[], null])[0]


                            return {
                                ...s,
                                cells: cells,
                                activeCell: cells.find(cell => cell.selected === true)
                            }
                        } else return s
                    })
                    .when(messages.UpdateConfig, (g, l, config: NotebookConfig) => {
                        return {
                            ...s,
                            config: {...s.config, config}
                        }
                    })
                    .when(messages.SetCellLanguage, (g, l, id: number, language: string) => {
                        let thisCell = undefined;
                        const cells = s.cells.map(c => {
                            if (c.id === id) {
                                thisCell = {...c, language}
                                return thisCell
                            } else return c
                        })
                        const activeCell = s.activeCell?.id === id ? thisCell : s.activeCell;
                        return {
                            ...s,
                            cells,
                            activeCell
                        }
                    })
                    .when(messages.SetCellOutput, (g, l, id: number, output?: Output) => {
                        // is `output` ever undefined??
                        if (output) {
                            return {
                                ...s,
                                cells: s.cells.map(c => {
                                    if (c.id === id) {
                                        return {...c, output: [output]}
                                    } else return c
                                })
                            }
                        } else return s
                    })
                    .when(messages.CreateComment, (g, l, id: number, comment: CellComment) => {
                        return {
                            ...s,
                            cells: s.cells.map(c => {
                                if (c.id === id){
                                    return {
                                        ...c,
                                        comments: {
                                            ...c.comments,
                                            [comment.uuid]: comment // we're trusting the server to be correct here.
                                        }
                                    }
                                } else return c
                            })
                        }
                    })
                    .when(messages.UpdateComment, (g, l, id: number, commentId: string, range: PosRange, content: string) => {
                        return {
                            ...s,
                            cells: s.cells.map(c => {
                                if (c.id === id) {
                                    const comment = c.comments[commentId];
                                    return {
                                        ...c,
                                        comments: {
                                            ...c.comments,
                                            [commentId]: new CellComment(commentId, range, comment.author, comment.authorAvatarUrl, comment.createdAt, content)
                                        }
                                    }
                                } else return c
                            })
                        }
                    })
                    .when(messages.DeleteComment, (g, l, id: number, commentId: string) => {
                        return {
                            ...s,
                            cells: s.cells.map(c => {
                                if (c.id === id) {
                                    const comments = {...c.comments}
                                    delete comments[commentId]
                                    return {
                                        ...c,
                                        comments,
                                    }
                                } else return c
                            })
                        }
                    }).otherwiseThrow ?? s;

                // discard edits before the local version from server – it will handle rebasing at least until that point
                const editBuffer = s.editBuffer.discard(update.localVersion);

                // make sure to update backups.
                ClientBackup.updateNb(s.path, update)
                    .catch(err => console.error("Error updating backup", err));

                return {
                    ...res,
                    editBuffer,
                    localVersion,
                    globalVersion,
                }
            } else {
                console.warn(
                    "Ignoring NotebookUpdate with globalVersion", update.globalVersion,
                    "that is less than our globalVersion", s.globalVersion,
                    ". This might mean something is wrong.", update)
                return NoUpdate
            }
        });
        this.receive(messages.CellResult, (s, cellId, result) => {
            if (cellId === -1 && ! (result instanceof ResultValue)) { // from a predef cell
                return purematch<Result, NotebookState | typeof NoUpdate>(result)
                    .whenInstance(CompileErrors, result => {
                        // TODO: should somehow save this state somewhere!! Maybe this should also go into s.errors?
                        console.warn("Something went wrong compiling a predef cell", result)
                        return NoUpdate
                    })
                    .whenInstance(RuntimeError, result => {
                        return {...s, errors: [...s.errors, result.error]}
                    })
                    .otherwiseThrow ?? NoUpdate
            } else {

                let symbols = s.kernel.symbols
                if (['busy', 'idle'].includes(s.kernel.status) && result instanceof ResultValue) {
                    symbols = [...s.kernel.symbols, result];
                }
                return {
                    ...s,
                    cells: s.cells.map(c => {
                        if (c.id === cellId) {
                            return this.parseResults(c, [result])
                        } else return c
                    }),
                    kernel: {...s.kernel, symbols }
                }
            }
        });

        //************* Streaming Messages ****************
        this.receive(messages.HandleData, (s, handlerType, handleId, count, data) => {
            return {
                ...s,
                activeStreams: {
                    ...s.activeStreams,
                    [handleId]: [...(s.activeStreams[handleId] || []), new messages.HandleData(handlerType, handleId, count, data)]
                }
            }
        })

        this.receive(messages.ModifyStream, (s, fromHandle, ops, newRepr) => {
            return {
                ...s,
                activeStreams: {
                    ...s.activeStreams,
                    [fromHandle]: [...(s.activeStreams[fromHandle] || []), new messages.ModifyStream(fromHandle, ops, newRepr)]
                }
            }
        })
    }

    private cellToState(cell: NotebookCell): CellState {
        return this.parseResults({
            id: cell.id,
            language: cell.language,
            content: cell.content,
            metadata: cell.metadata,
            comments: cell.comments,
            output: [],
            results: [],
            compileErrors: [],
            pendingEdits: [],
            presence: []
        }, cell.results);
    }

    private parseResults(cell: CellState, results: Result[]): CellState {
        return results.reduce<CellState>((cell, result) => {
            return purematch<Result, CellState>(result)
                .when(ClearResults, () => {
                    return {...cell, output: [], results: [], compileErrors: [], runtimeError: undefined, error: false}
                })
                .whenInstance(ResultValue, result => {
                    return {...cell, results: [...cell.results, result]}

                })
                .whenInstance(CompileErrors, result => {
                    return {...cell, compileErrors: [...cell.compileErrors, result], error: true}
                })
                .whenInstance(RuntimeError, result => {
                    return {...cell, runtimeError: result, error: true}
                })
                .whenInstance(Output, result => {
                    return {...cell, output: [result]}
                })
                .whenInstance(ExecutionInfo, result => {
                    return {
                        ...cell,
                        metadata: cell.metadata.copy({executionInfo: result})
                    }
                })
                .whenInstance(ClientResult, result => {
                    return {...cell, results: [...cell.results, result]}
                }).otherwiseThrow || cell
        }, cell)
    }
}

export class ServerMessageReceiver extends MessageReceiver<ServerState> {
    public notebooks: Record<string, NotebookMessageReceiver> = {};

    constructor() {
        super(SocketStateHandler.global, ServerStateHandler.get);

        this.socket.view("status").addObserver(status => {
            this.state.updateState(s => {
                return {
                    ...s, connectionStatus: status
                }
            })
        });

        this.receive(messages.Error, (s, code, err) => {
            return {
                ...s,
                errors: [...s.errors, {code, err}]
            }
        });
        this.receive(messages.CreateNotebook, (s, path) => {
            return {
                ...s,
                notebooks: {
                    ...s.notebooks,
                    [path]: ServerStateHandler.getOrCreateNotebook(path).loaded
                }
            }
        });
        this.receive(messages.RenameNotebook, (s, oldPath, newPath) => {
            ServerStateHandler.renameNotebook(oldPath, newPath)
            return NoUpdate // `renameNotebook` already takes care of updating the state.
        });
        this.receive(messages.DeleteNotebook, (s, path) => {
            ServerStateHandler.deleteNotebook(path)
            return NoUpdate // `deleteNotebook` already takes care of updating the state.
        });
        this.receive(messages.ListNotebooks, (s, paths) => {
            const notebooks = {...s.notebooks}
            paths.forEach(path => {
                notebooks[path] = ServerStateHandler.getOrCreateNotebook(path).loaded
            })
            return { ...s, notebooks }
        });
        this.receive(messages.ServerHandshake, (s, interpreters, serverVersion, serverCommit, identity, sparkTemplates) => {
            // First, we need to check to see if versions match. If they don't, we need to reload to clear out any
            // messed up state!
            if (s.serverVersion !== "unknown" && serverVersion !== s.serverVersion) {
                window.location.reload()
            }

            // inject the client interpreters here as well.
            Object.keys(ClientInterpreters).forEach(key => {
                interpreters[key] = ClientInterpreters[key].languageTitle
            });

            return {
                ...s,
                interpreters: interpreters,
                serverVersion: serverVersion,
                serverCommit: serverCommit,
                identity: identity ?? new Identity("Unknown User", null),
                sparkTemplates: sparkTemplates,
            }
        });
        this.receive(messages.RunningKernels, (s, kernelStatuses) => {
            const notebooks = {...s.notebooks}
            kernelStatuses.forEach(kv => {
                const path = kv.first;
                const status = kv.second;
                const nbInfo = ServerStateHandler.getOrCreateNotebook(path)
                nbInfo.handler.updateState(nbState => {
                    return {
                        ...nbState,
                        kernel: {
                            ...nbState.kernel,
                            status: status.asStatus
                        }
                    }
                })
                notebooks[path] = nbInfo.loaded
            })
            return { ...s, notebooks}
        })
    }
}
