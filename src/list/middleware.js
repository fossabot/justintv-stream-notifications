import { formatChannel, getExternalID } from './utils';
import LiveState from '../live-state.json';
import { copy } from '../content/utils';
import { LIVE_TAB, EXTRAS_TAB } from './constants/tabs.json';
import storeTypes from './constants/store-types.json';

export default (port) => ({
    getState, dispatch
}) => (next) => (action) => {
    const state = getState();

    // State based redirects of backend commands
    if(action.command === "explore" && state.ui.search && state.ui.query.length) {
        port.send("search", {
            type: action.payload,
            query: state.ui.query
        });
    }
    else if(action.command === "refresh" && state.ui.tab === EXTRAS_TAB) {
        if(state.ui.search && state.ui.query.length) {
            port.send("search", {
                type: state.ui.currentProvider,
                query: state.ui.query
            });
        }
        else {
            port.send("explore", state.ui.currentProvider);
        }
    }
    // Default backend commands
    else if(action.command) {
        port.send(action.command, action.payload);
    }
    // State changes that trigger a backend command (i.e. everything that's wrong with this app)
    else if(action.type === storeTypes.SET_TAB) {
        // This has to be aborted, else the loading state is set when payload === 3
        if(state.ui.tab === action.payload) {
            return;
        }
        else if(action.payload === EXTRAS_TAB) {
            if(!state.ui.search || !state.ui.query.length) {
                port.send("explore", state.ui.currentProvider);
            }
            else {
                port.send("search", {
                    type: state.ui.currentProvider,
                    query: state.ui.query
                });
            }
        }
    }
    else if(action.type === storeTypes.SEARCH && state.ui.tab === EXTRAS_TAB) {
        if(action.payload.length) {
            port.send("search", {
                type: state.ui.currentProvider,
                query: action.payload
            });
        }
        else {
            port.send("explore", state.ui.currentProvider);
        }
        dispatch({
            type: storeTypes.LOADING
        });
    }
    else if(action.type === storeTypes.SET_FEATURED) {
        if((state.ui.search && ((state.ui.query.length && state.ui.query != action.payload.q) || !("q" in action.payload))) || state.ui.currentProvider != action.payload.type) {
            return;
        }
        action = {
            type: action.type,
            payload: action.payload.channels
        };
    }
    else if(action.type === storeTypes.TOGGLE_SEARCH && state.ui.search && state.ui.query.length && state.ui.tab === EXTRAS_TAB) {
        port.send("explore", state.ui.currentProvider);
        dispatch({
            type: storeTypes.LOADING
        });
    }
    // The following code is proof, that the contextChannel model is not optimal:
    else if(action.type === storeTypes.UPDATE_CHANNEL && state.contextChannel) {
        const updatedChannel = Object.assign({}, action.payload);
        if(!updatedChannel.id) {
            updatedChannel.id = getExternalID(updatedChannel);
        }
        if(updatedChannel.state.alternateChannel) {
            updatedChannel.state = Object.assign({}, action.payload.state);
            updatedChannel.state.alternateChannel = Object.assign({}, action.payload.state.alternateChannel);
            if(!updatedChannel.state.alternateChannel.id) {
                updatedChannel.state.alternateChannel.id = getExternalID(updatedChannel.state.alternateChannel);
            }
        }
        // Is the contextChannel
        if(state.contextChannel.id === updatedChannel.id) {
            updatedChannel.redirectors = state.contextChannel.redirectors;
            dispatch({
                type: storeTypes.SET_CONTEXT_CHANNEL,
                payload: formatChannel(updatedChannel, state.providers, LIVE_TAB, state.settings.extras, "compact")
            });
        }
        // Started redirecting to the contextChannel
        else if(updatedChannel.live.state === LiveState.REDIRECT && state.contextChanel.id === updatedChannel.state.alternateChannel.id && state.contextChannel.redirectors.every((r) => r.id !== updatedChannel.id)) {
            state.contextChanel.redirectors.push({
                uname: updatedChannel.uname,
                image: updatedChannel.image,
                id: updatedChannel.id
            });
            dispatch({
                type: storeTypes.SET_CONTEXT_CHANNEL,
                payload: state.contextChannel
            });
        }
        else if(state.contextChannel.redirectors.some((r) => r.id === updatedChannel.id)) {
            // Stopped redirecting to the contextChannel
            if(!updatedChannel.state.alternateChannel || updatedChannel.state.alternateChannel.id !== state.contextChannel.id) {
                state.contextChannel.redirectors = state.contextChannel.redirectors.filter((r) => r.id !== updatedChannel.id);
                dispatch({
                    type: storeTypes.SET_CONTEXT_CHANNEL,
                    payload: state.contextChannel
                });
            }
            // Redirector updated
            else {
                state.contextChannel.redirectors = state.contextChannel.redirectors.map((r) => {
                    if(r.id === updatedChannel.id) {
                        return {
                            uname: updatedChannel.uname,
                            image: updatedChannel.image,
                            id: updatedChannel.id
                        };
                    }
                    return r;
                });
                dispatch({
                    type: storeTypes.SET_CONTEXT_CHANNEL,
                    payload: state.contextChannel
                });
            }
        }
    }
    else if(action.type === storeTypes.COPY) {
        if(copy(state.settings.copyPattern.replace("{URL}", action.payload.url))) {
            dispatch({
                command: "copied",
                payload: action.payload.uname
            });
        }
        return;
    }

    // Finally your default middleware end and no more ugly hacks.

    if(action.type) {
        return next(action);
    }
    return action;
};
