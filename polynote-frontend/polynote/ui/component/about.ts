import {FullScreenModal} from "../layout/modal";
import {button, div, dropdown, h2, h3, iconButton, span, loader, table, tag, polynoteLogo} from "../tags";
import * as monaco from "monaco-editor";
import {ClientBackup} from "../../state/client_backup";
import {ServerStateHandler} from "../../state/server_state";
import {
    clearStorage,
    LocalStorageHandler,
    NotebookScrollLocationsHandler, OpenNotebooksHandler,
    RecentNotebooksHandler,
    UserPreferencesHandler, ViewPrefsHandler
} from "../../state/preferences";
import {Observer, StateView} from "../../state/state_handler";
import {
    CloseNotebook,
    KernelCommand, RequestRunningKernels,
    ServerMessageDispatcher,
    SetSelectedNotebook
} from "../../messaging/dispatcher";
import {TabNav} from "../layout/tab_nav";
import {getHotkeys} from "../input/hotkeys";

export class About extends FullScreenModal {
    readonly observers: [StateView<any>, Observer<any>][] = []
    private cleanup: (()=> void)[] = []
    private constructor(private serverMessageDispatcher: ServerMessageDispatcher) {
        super(
            div([], []),
            { windowClasses: ['about'] }
        );
    }

    private static inst: About;
    private static get(dispatcher: ServerMessageDispatcher) {
        if (!About.inst || About.inst.serverMessageDispatcher !== dispatcher) {
            About.inst = new About(dispatcher);
        }
        return About.inst
    }

    static show(dispatcher: ServerMessageDispatcher, section?: string) {
        About.get(dispatcher).show(section)
    }

    aboutMain() {
        const el = div(["about-display"], [
            div([], [
                polynoteLogo(),
                h2([], ["About this Polynote Server"])
            ])
        ]);

        const {serverVersion, serverCommit} = ServerStateHandler.state
        const info = [
            ["Server Version", serverVersion],
            ["Server Commit", serverCommit]
        ];
        const tableEl = table(['server-info'], {
            classes: ['key', 'val'],
            rowHeading: false,
            addToTop: false
        });
        for (const [k, v] of info) {
            tableEl.addRow({
                key: k.toString(),
                val: v.toString()
            })
        }

        el.appendChild(tableEl);
        return el;
    }

    hotkeys() {
        const el = div(["hotkeys-display"], [
            div([], [
                h2([], ["Press these buttons to do things"])
            ])
        ]);

        const tableEl = table([], {
            classes: ['key', 'desc'],
            rowHeading: false,
            addToTop: false
        });

        Object.entries(getHotkeys()).forEach(([key, desc]) => {
            tableEl.addRow({
                key,
                desc
            })
        })

        el.appendChild(tableEl);
        return el;
    }

    preferences() {
        let storageInfoEl, preferencesEl;
        const el = div(["preferences-storage"], [
            div([], [
                h2([], ["UI Preferences and Storage"]),
                span([], ["The Polynote UI keeps some information in your browser's Local Storage, including some preferences you can configure yourself."]),
                tag('br'),
                button(['clear', 'about-button'], {}, ['Clear All Preferences and Storage'])
                    .click(() => {
                        clearStorage();
                    }),
                tag('br'),
                h3([], ["Preferences"]),
                preferencesEl = div(['preferences'], []),
                h3([], ["Storage"]),
                span([], ["Here's everything Polynote is storing in local storage"]),
                storageInfoEl = div(['storage'], [])
            ])
        ]);

        const prefsTable = table([], {
            classes: ['key', 'val', 'desc'],
            rowHeading: false,
            addToTop: false
        });

        Object.entries(UserPreferencesHandler.state).forEach(([key, pref]) => {
            const value = pref.value;
            let valueEl;
            const options = Object.entries(pref.possibleValues).reduce<Record<string, string>>((acc, [k, v]) => {
                acc[k] = v.toString()
                return acc
            }, {})
            valueEl = dropdown([], options).change(evt => {
                const self = evt.currentTarget;
                if (! self || ! (self instanceof HTMLSelectElement)) {
                    throw new Error(`Unexpected Event target for event ${JSON.stringify(evt)}! Expected \`currentTarget\` to be an HTMLSelectElement but instead got ${JSON.stringify(self)}`)
                }
                const updatedValue = pref.possibleValues[self.options[self.selectedIndex].value];
                UserPreferencesHandler.updateState(state => {
                    return {
                        ...state,
                        [key]: {
                            ...pref,
                            value: updatedValue
                        }
                    }
                })
            });
            valueEl.value = value.toString();
            prefsTable.addRow({
                key,
                val: valueEl ?? value.toString(),
                desc: pref.description
            })
        })

        preferencesEl.appendChild(prefsTable);

        const storageTable = table([], {
            classes: ['key', 'val', 'clear'],
            rowHeading: false,
            addToTop: false
        });

        const addStorageEl = <T>(handler: LocalStorageHandler<T>) => {
            const valueEl = div(['json'], []);

            const setValueEl = (value: any) => {
                monaco.editor.colorize(JSON.stringify(value), "json", {}).then(function(result) {
                    valueEl.innerHTML = result;
                });
            };
            setValueEl(handler.state);

            const obs = handler.addObserver(next => {
                setValueEl(next)
            })
            this.observers.push([handler, obs])

            const clearEl = iconButton(["clear"], `Clear ${handler.key}`, "trash-alt", "Clear")
                .click(() => handler.clear())

            storageTable.addRow({
                key: handler.key,
                val: valueEl,
                clear: clearEl
            })
        }

        addStorageEl(UserPreferencesHandler)
        addStorageEl(RecentNotebooksHandler)
        addStorageEl(NotebookScrollLocationsHandler)
        addStorageEl(OpenNotebooksHandler)
        addStorageEl(ViewPrefsHandler)

        storageInfoEl.appendChild(storageTable);

        return el;
    }

    openKernels() {
        let content = div([], ['Looks like no kernels are open now!']);
        const el = div(["open-kernels"], [
            div([], [
                h2([], ["Open Kernels"]),
                content
            ])
        ]);

        const onNotebookUpdate = () => {

            const tableEl = table(['kernels'], {
                header: ['path', 'status', 'actions'],
                classes: ['path', 'status', 'actions'],
                rowHeading: false,
                addToTop: false
            });

            ServerStateHandler.openNotebooks.forEach(([path, info]) => {
                const status = info.handler.state.kernel.status;
                const statusEl = span([], [
                    span(['status'], [status]),
                ]);
                const actions = div([], [
                    loader(),
                    iconButton(['start'], 'Start kernel', 'power-off', 'Start').click(() => {
                        info.info!.dispatcher.dispatch(new KernelCommand("start"))
                    }),
                    iconButton(['kill'], 'Kill kernel', 'skull', 'Kill').click(() => {
                        info.info!.dispatcher.dispatch(new KernelCommand("kill"))
                    }),
                    iconButton(['open'], 'Open notebook', 'external-link-alt', 'Open').click(() => {
                        this.serverMessageDispatcher.dispatch(new SetSelectedNotebook(path))
                        this.hide();
                    }),
                ]);

                const rowEl = tableEl.addRow({ path, status: statusEl, actions });
                rowEl.classList.add('kernel-status', status)
                const obs = info.handler.addObserver((state, prev) => {
                    const status = state.kernel.status;
                    rowEl.classList.replace(prev.kernel.status, status)
                    statusEl.innerText = status;
                })
                this.observers.push([info.handler, obs])

                // load the notebook if it hasn't been already
                if (!info.loaded) {
                    rowEl.classList.add('loading')
                    this.serverMessageDispatcher.loadNotebook(path, false).then(newInfo => {
                        info = newInfo; // update `info` for the button click callbacks
                        rowEl.classList.remove("loading");
                    })

                    this.cleanup.push(() => {
                        if (ServerStateHandler.state.currentNotebook !== path) {
                            this.serverMessageDispatcher.dispatch(new CloseNotebook(path))
                        }
                    })
                }

                if (content.firstChild !== tableEl) {
                    content.firstChild?.replaceWith(tableEl);
                }
            })
        }
        this.serverMessageDispatcher.dispatch(new RequestRunningKernels())
        onNotebookUpdate()
        const nbs = ServerStateHandler.get.view("notebooks")
        const watcher = nbs.addObserver(() => onNotebookUpdate())
        this.observers.push([nbs, watcher])

        return el;
    }

    clientBackups() {
        let backupInfoEl;
        const el = div(["client-backups"], [
            div([], [
                h2([], ["Client-side Backups"]),
                span([], ["Polynote stores backups of your notebooks in your browser. These backups are intended to be " +
                "used as a last resort, in case something happened to the physical files on disk. This is not intended " +
                "to replace a proper version history feature which may be implemented in the future. Your browser may " +
                "chose to delete these backups at any time!"]),
                tag('br'),
                button(['about-button'], {}, ['Print Backups to JS Console'])
                    .click(() => {
                        ClientBackup.allBackups()
                            .then(backups => console.log("Here are all the currently stored backups", backups))
                            .catch(err => console.error("Error while fetching backups!", err));
                    }),
                button(['clear', 'about-button'], {}, ['Clear all backups'])
                    .click(() => {
                        if (confirm("Are you sure you want to clear all the backups? You can't undo this!")) {
                            ClientBackup.clearBackups()
                                .then(backups => console.log("Cleared backups. Here they are one last time.", backups))
                                .catch(err => console.error("Error while clearing backups!", err));
                        }
                    }),
                tag('br'),
                h3([], ["Backups"]),
                span([], ["Here are all the backups:"]),
                backupInfoEl = div(['storage'], [])
            ])
        ]);

        const backupsTable = table([], {
            classes: ['path', 'ts', 'backup'],
            rowHeading: false,
            addToTop: false
        });

        ClientBackup.allBackups()
            .then(backups => {
                for (const [k, v] of Object.entries(backups)) {

                    Object.entries(v.backups)
                        .sort(([ts1, _], [ts2, __]) => parseInt(ts2) - parseInt(ts1))
                        .forEach(([ts, backups]) => {
                            backups.sort((b1, b2) => b2.ts - b1.ts).forEach(backup => {
                                const valueEl = div(['json'], []);

                                const backupsJson = JSON.stringify(backup, (k, v) => typeof v === 'bigint' ? v.toString : v);

                                monaco.editor.colorize(backupsJson, "json", {}).then(function(result) {
                                    valueEl.innerHTML = result;
                                });

                                backupsTable.addRow({
                                    path: k,
                                    ts: new Date(backup.ts).toLocaleString(),
                                    backup: valueEl
                                })
                            })
                        })
                }
            });

        backupInfoEl.appendChild(backupsTable);

        return el;
    }


    show(section?: string) {
        const tabs = {
            'About': this.aboutMain.bind(this),
            'Hotkeys': this.hotkeys.bind(this),
            'Preferences': this.preferences.bind(this),
            'Open Kernels': this.openKernels.bind(this),
            'Client-side Backups': this.clientBackups.bind(this),
        };
        const tabnav = new TabNav(tabs);
        this.content.firstChild?.replaceWith(tabnav.el);
        if (section) tabnav.showItem(section);

        super.show();
    }

    hide() {
        while(this.observers.length > 0) {
            const item = this.observers.pop()!;
            const handler = item[0];
            const obs = item[1];
            handler.removeObserver(obs)
        }
        this.cleanup.forEach(f => f())
        super.hide()
    }
}
