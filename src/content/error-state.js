import ErrorStateConsts from '../error-state.json';
import "./shared.css";

//TODO update error state gravity based on add/remove and not querying the storage.

class ErrorStateView {
    static get ERROR_STATE() {
        return browser.storage.local.get(ErrorStateConsts.STORE)
            .then(({ [ErrorStateConsts.STORE]: values }) => {
                if(Array.isArray(values) && values.length) {
                    return values.some((e) => e.gravity > ErrorStateConsts.RECOVERABLE) ? ErrorStateConsts.UNRECOVERABLE : ErrorStateConsts.RECOVERABLE;
                }
                return ErrorStateConsts.NONE;
            });
    }

    static getClassForGravity(gravity) {
        return gravity === ErrorStateConsts.UNRECOVERABLE ? "unrecoverable" : "recoverable";
    }

    constructor(hook) {
        this.root = document.createElement("details");
        this.root.open = true;
        this.root.hidden = true;
        this.root.classList.add("esv");
        this.currentGravity = ErrorStateConsts.NONE;

        this.title = document.createElement("summary");

        this.root.appendChild(this.title);

        this.list = document.createElement("ul");

        this.root.appendChild(this.list);

        browser.storage.local.get(ErrorStateConsts.STORE)
            .then(({ [ErrorStateConsts.STORE]: values }) => {
                for(const es of values) {
                    this.addError(es);
                }
                this.updateTitle();
                hook.appendChild(this.root);
            })
            .catch(console.error);

        browser.storage.onChanged.addListener((changes, areaName) => {
            if(areaName === "local" && ErrorStateConsts.STORE in changes) {
                const errorStateChanges = changes[ErrorStateConsts.STORE];
                for(const e of errorStateChanges.newValue) {
                    if(!errorStateChanges.oldValue.length || errorStateChanges.oldValue.every(({ id }) => id !== e.id)) {
                        this.addError(e);
                    }
                }

                if(Array.isArray(errorStateChanges.oldValue)) {
                    for(const e of errorStateChanges.oldValue) {
                        if(!errorStateChanges.newValue.length || errorStateChanges.newValue.every(({ id }) => id !== e.id)) {
                            this.removeError(e.id);
                        }
                    }
                }
                this.updateTitle();
            }
        });
    }

    async updateTitle(gravity) {
        if(!gravity) {
            gravity = await ErrorStateView.ERROR_STATE;
        }

        if(gravity != this.currentGravity) {
            if(gravity === ErrorStateConsts.NONE) {
                this.root.hidden = true;
            }
            else {
                this.root.hidden = false;
                this.title.textContent = browser.i18n.getMessage(`errorState${gravity}`);
                this.title.classList.add(ErrorStateView.getClassForGravity(gravity));
            }
            this.currentGravity = gravity;
        }
    }

    sendAction(id, action) {
        browser.runtime.sendMessage({
            command: 'errorState-action',
            id,
            action
        });
    }

    addError(errorState) {
        const root = document.createElement("li"),
            message = document.createElement("p");
        root.classList.add(ErrorStateView.getClassForGravity(errorState.gravity));
        root.id = `es${errorState.id}`;

        message.textContent = errorState.message;

        root.appendChild(message);

        if(errorState.actions.length) {
            const buttons = document.createElement("div");
            buttons.classList.add("buttons");

            for(const actionId in errorState.actions) {
                const action = errorState.actions[actionId],
                    button = document.createElement("button");
                button.classList.add("browser-style");
                button.textContent = action;
                button.value = action;
                button.addEventListener("click", () => this.sendAction(errorState.id, actionId), {
                    passive: true,
                    capture: false
                });

                buttons.appendChild(button);
            }

            root.appendChild(buttons);
        }
        this.list.appendChild(root);
    }

    removeError(id) {
        const root = document.getElementById(`es${id}`);
        root.remove();
    }
}

export default (root) => {
    new ErrorStateView(root);
};
