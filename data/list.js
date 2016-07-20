/*
 * Created by Martin Giger
 * Licensed under MPL 2.0
 */

/* global addon */
/* global filter */
/* global matches */
/* global show */
/* global hide */

// This is just to avoid errors when loading the list in a tab in tests.
if(!("addon" in window)) {
    window.addon = {
        port: {
            emit: () => {},
            on: () => {},
            once: () => {}
        },
        options: {}
    };
}

var live, secondaryLive, offline, distinct, explore, currentMenuTarget, currentStyle, providers, nonLiveDisplay;
const CHANNEL_ID_PREFIX = "channel";
const EXPLORE_ID_PREFIX = "explorechan";
const CONTEXTMENU_ID    = "context";
const EXPLORE_CONTEXTMENU_ID = "explore-context";
const filters = [
    {
        subtarget: ".provider"
    },
    {
        subtarget: ".name"
    },
    {
        subtarget: ".alternate-name"
    },
    {
        subtarget: ".title"
    },
    {
        subtarget: ".viewers"
    },
    {
        subtarget: ".category"
    }
];

var toggle = (node, condition) => {
    if(condition)
        show(node);
    else
        hide(node);
};

var getChannelIdFromId = (id) => parseInt(id.substring(CHANNEL_ID_PREFIX.length), 10);

var contextMenuCommand = function(event) {
    addon.port.emit(event, getChannelIdFromId(currentMenuTarget.id));
    currentMenuTarget = null;
};

var resize = () => {
    var scrollHeight = document.querySelector(".tabbed").scrollHeight;
    var h = Math.ceil(Math.min(scrollHeight, addon.options.maxHeight));
    addon.port.emit("resize", [addon.options.panelWidth, h]);
};

var openChannel = (channelId, e) => {
    if(e)
        e.preventDefault();
    addon.port.emit("open", channelId);
};

var openUrl = (url, e) => {
    if(e)
        e.preventDefault();
    addon.port.emit("openUrl", url);
};

var displayNoOnline = () => {
    show(document.getElementById("noonline"));
};

var hideNoOnline = () => {
    hide(document.getElementById("noonline"));
};

var hideNoChannels = () => {
    hide(document.getElementById("nochannels"));
};

var displayNoChannels = () => {
    displayNoOnline();
    show(document.getElementById("nochannels"));
};

var displayLoading = () => {
    show(document.getElementById("loadingexplore"));
    explore.parentNode.classList.add("loading");
};

var hideLoading = () => {
    hide(document.getElementById("loadingexplore"));
    explore.parentNode.classList.remove("loading");
};

var setStyle = (style) => {
    var newClass;
    switch(style) {
        case 2:
            newClass = "thumbnail";
            break;
        case 0:
            newClass = "compact";
            break;
        default:
            newClass = "default";
    }
    if(newClass != currentStyle) {
        var main = document.querySelector(".tabbed");
        main.classList.add(newClass);
        main.classList.remove(currentStyle);
        currentStyle = newClass;
    }
    resize();
};

var setExtrasVisibility = (visible) => {
    document.querySelector(".tabbed").classList.toggle("extras", visible);
};

// Find the node to inser before in order to keep the list sorted
var findInsertionNodeIn = (list, name) => {
    var node = list.firstElementChild;

    while(node && name.localeCompare(node.querySelector(".name").textContent) >= 0) {
        node = node.nextSibling;
    }
    return node;
};

const insertBefore = (parent, node, uname) => {
    if(!parent.querySelector("#"+node.id))
        parent.insertBefore(node, findInsertionNodeIn(parent, uname));
};

var insertChannel = (channel, node) => {
    if(channel.live.isLive && (channel.live.state <= 0 || nonLiveDisplay === 0))
        insertBefore(live, node, channel.uname);
    else if(channel.live.isLive && nonLiveDisplay == 1)
        insertBefore(secondaryLive, node, channel.uname);
    else if(channel.live.isLive && nonLiveDisplay == 2)
        insertBefore(distinct, node, channel.uname);
    else
        insertBefore(offline, node, channel.uname);

    resize();
};

var contextMenuListener = (e) => {
    currentMenuTarget = e.currentTarget;
    var isOffline = e.currentTarget.parentNode.id == "offline";
    document.getElementById("contextOpen").disabled = isOffline;
    document.getElementById("contextRefresh").disabled = !providers[e.currentTarget.className].enabled;
    document.getElementById("contextAdd").disabled = !providers[e.currentTarget.className].enabled;
};

var buildChannel = (channel, unspecific = false) => {
    //TODO some visual indicator for rebroadcasts
    var channelNode   = document.createElement("li");
    channelNode.insertAdjacentHTML("beforeend",
`<a href="" contextmenu="${unspecific ? EXPLORE_CONTEXTMENU_ID : CONTEXTMENU_ID}">
    <img src="">
    <div>
        <img srcset="" sizes="30w">
        <span class="rebroadcast hide-offline" hidden><svg class="icon" viewBox="0 0 8 8">
            <use xlink:href="sprite/open-iconic.min.svg#loop"></use>
        </svg> </span><span class="name"></span><span class="nonlivename hide-offline" hidden> → <span class="alternate-name"></span></span><br>
        <span class="title hide-offline"></span>
        <aside>
            <span class="viewersWrapper hide-offline">
                <svg class="icon" viewBox="0 0 8 8">
                    <use xlink:href="sprite/open-iconic.min.svg#eye"></use>
                </svg>&nbsp;<span class="viewers">0</span>&#x20;
            </span>
            <span class="categoryWrapper hide-offline">
                <svg class="icon" viewBox="0 0 8 8">
                    <use xlink:href="sprite/open-iconic.min.svg#tag"></use>
                </svg>&nbsp;<span class="category"></span>&#x20;
            </span>
            <span class="providerWrapper">
                <svg class="icon" viewBox="0 0 8 8">
                    <use xlink:href="sprite/open-iconic.min.svg#hard-drive"></use>
                </svg>&nbsp;<span class="provider"></span>
            </span>
        </aside>
    </div>
</a>`);
    channelNode.querySelector("div img").setAttribute("srcset", Object.keys(channel.image).map((s) => channel.image[s] + " " + s + "w").join(","));
    channelNode.querySelector("a > img").setAttribute("src", channel.thumbnail);
    channelNode.querySelector(".name").textContent = channel.uname;
    channelNode.querySelector(".title").textContent = channel.title;
    channelNode.querySelector(".alternate-name").textContent = channel.live.alternateUsername;
    toggle(channelNode.querySelector(".nonlivename"), channel.live.alternateUsername !== "");
    toggle(channelNode.querySelector(".rebroadcast"), channel.live.state == 2);
    if(!("viewers" in channel) || channel.viewers < 0)
        hide(channelNode.querySelector(".viewersWrapper"));
    channelNode.querySelector(".viewers").textContent = channel.viewers;
    if(!channel.category)
        hide(channelNode.querySelector(".categoryWrapper"));
    channelNode.querySelector(".category").textContent = channel.category;
    channelNode.querySelector(".provider").textContent = providers[channel.type].name;
    channelNode.classList.add(channel.type);
    if(!unspecific) {
        channelNode.id = CHANNEL_ID_PREFIX+channel.id;
        channelNode.querySelector("a").addEventListener("click", openChannel.bind(null, channel.id));
    }
    else {
        channelNode.id = EXPLORE_ID_PREFIX+channel.login;
        channelNode.dataset.url = channel.url[0];
        channelNode.querySelector("a").addEventListener("click", openUrl.bind(null, channel.live.isLive ? channel.url[0] : channel.archiveUrl));
    }
    channelNode.addEventListener("contextmenu", contextMenuListener);

    if(channel.live.state > 0)
        channelNode.classList.add("nonlive");

    return channelNode;
};

const countLiveChannels = () => live.childElementCount + secondaryLive.childElementCount;

var addChannel = (channel) => {
    var channelNode = buildChannel(channel);
    // hide the channel by if it's filtered out atm
    if(!matches(channelNode, document.querySelector("#searchField").value, filters))
        hide(channelNode);

    insertChannel(channel, channelNode);
    hideNoChannels();
    if(channel.live.isLive)
        hideNoOnline();
};

var removeChannel = (channelId) => {
    var channelNode = document.getElementById(CHANNEL_ID_PREFIX+channelId);
    if("live" == channelNode.parentNode.id) {
        addon.port.emit("removedLive", channelId);
        // Smaller two, since we remove the channel node after this, as we still
        // needed its parent's id before.
        if(countLiveChannels() < 2) {
            displayNoOnline();
        }
    }

    channelNode.remove();

    if(countLiveChannels() === 0 && offline.childElementCount === 0 && distinct.childElementCount === 0)
        displayNoChannels();

    resize();
};

var updateNodeContent = (channel) => {
    var channelNode = document.getElementById(CHANNEL_ID_PREFIX+channel.id),
        nameNode = channelNode.querySelector(".name"),
        titleNode = channelNode.querySelector(".title"),
        viewers = channelNode.querySelector(".viewers"),
        category = channelNode.querySelector(".category");

    titleNode.textContent = channel.title;
    nameNode.textContent = channel.uname;
    channelNode.querySelector(".alternate-name").textContent = channel.live.alternateUsername;
    toggle(channelNode.querySelector(".nonlivename"), channel.live.alternateUsername !== "");
    toggle(channelNode.querySelector(".rebroadcast"), channel.live.state == 2);

    viewers.textContent = channel.viewers;
    toggle(channelNode.querySelector(".viewersWrapper"), ("viewers" in channel) && channel.viewers > 0);

    category.textContent = channel.category;
    toggle(channelNode.querySelector(".categoryWrapper"), !!channel.category);

    channelNode.classList.toggle("nonlive", channel.live.state > 0);

    // only update images if the user is online to avoid broken images
    if(navigator.onLine) {
        if(channel.live.isLive)
            channelNode.querySelector("a>img").setAttribute("src", channel.thumbnail+"?timestamp="+Date.now());

        channelNode.querySelector("a div img").srcset = Object.keys(channel.image)
            .map((s) => channel.image[s] + " " + s + "w").join(",");
    }
};

//TODO placing stuff (live channel goes hosted -> might need reordering)

var makeChannelLive = (channel) => {
    hideNoOnline();
    updateNodeContent(channel);
    insertChannel(channel, document.getElementById(CHANNEL_ID_PREFIX+channel.id));
};

var makeChannelOffline = (channel) => {
    insertChannel(channel, document.getElementById(CHANNEL_ID_PREFIX+channel.id));
    updateNodeContent(channel);
    if(countLiveChannels() === 0)
        displayNoOnline();
};

const makeChannelDistinct = (channel) => {
    insertChannel(channel, document.getElementById(CHANNEL_ID_PREFIX+channel.id));
    updateNodeContent(channel);
    if(countLiveChannels() === 0)
        displayNoOnline();
};

var getFeaturedChannels = (type) => {
    displayLoading();
    addon.port.emit("explore", type);
};

var providerSearch = (type, query) => {
    displayLoading();
    addon.port.emit("search", type, query);
};

var externalContextMenuCommand = (command) => {
    addon.port.emit(command, currentMenuTarget.className, currentMenuTarget.id.substring(EXPLORE_ID_PREFIX.length));
    currentMenuTarget = null;
};

var forwardEvent = (name, event) => {
    event.preventDefault();
    addon.port.emit(name);
};

var applySearchToExplore = (exploreSelect, field) => {
    if(field.hasAttribute("hidden") || field.value === "")
        getFeaturedChannels(exploreSelect.value);
    else
        providerSearch(exploreSelect.value, field.value);
};

var hasOption = (provider) => {
    var providerDropdown = document.getElementById("exploreprovider");
    for(var o of providerDropdown.options) {
        if(o.value == provider) {
            return true;
        }
    }
    return false;
};

var addExploreProviders = (exploreProviders) => {
    if(exploreProviders.length > 0) {
        show(document.getElementById("exploreTab"));
        var providerDropdown = document.getElementById("exploreprovider");
        exploreProviders.forEach((p) => {
            if(!hasOption(p)) {
                providerDropdown.add(new Option(providers[p].name, p));
            }
        });
        displayLoading();
    }
};

var toggleQueueContextItems = (queuePaused) => {
    toggle(document.getElementById("pauseAutorefresh"), !queuePaused);
    toggle(document.getElementById("resumeAutorefresh"), queuePaused);
};

const setNonLiveDisplay = (display) => {
    const nonLiveTab = document.getElementById("nonliveTab");
    toggle(nonLiveTab, display == 2);
    toggle(secondaryLive, display == 1);

    const tabbed = document.querySelector(".tabbed");
    if(nonLiveDisplay == 2 && display != 2 && tabbed._tabbed.current == 4)
        tabbed._tabbed.select(1);

    nonLiveDisplay = display;

    // Reposition all existing non-live channels
    const channelsToMove = Array.from(document.querySelectorAll(".nonlive"));
    var parent = live;
    if(display == 1)
        parent = secondaryLive;
    else if(display == 2)
        parent = distinct;
    else if(display == 3)
        parent = offline;

    if(channelsToMove.length && display <= 1) {
        hideNoOnline();
    }

    for(let node of channelsToMove) {
        insertBefore(parent, node, node.querySelector(".name").textContent);
    }
    
    if(countLiveChannels() === 0 && display >= 2) {
        displayNoOnline();
    }
};

const setTheme = (theme) => {
    document.body.classList.toggle("dark", theme === 1);
};

// Set up port commmunication listeners
addon.port.on("setStyle", setStyle);
addon.port.on("setExtras", setExtrasVisibility);
addon.port.on("addChannels", (channels) => channels.forEach(addChannel));
addon.port.on("removeChannel", removeChannel);
addon.port.on("setOnline", makeChannelLive);
addon.port.on("setOffline", makeChannelOffline);
addon.port.on("setDistinct", makeChannelDistinct);
addon.port.on("resize", resize);
addon.port.on("setNonLiveDisplay", setNonLiveDisplay);
addon.port.on("queuePaused", (paused) => {
    toggleQueueContextItems(paused);
    document.getElementById("refreshButton").classList.toggle("running", !paused);
});

// Queue autorefresh is enabled/disabled in the settings
addon.port.on("queueStatus", (enabled) => {
    var button = document.getElementById("refreshButton");
    if(enabled)
        button.setAttribute("contextmenu", "queue-context");
    else
        button.removeAttribute("contextmenu");

    button.classList.toggle("running", enabled);
});

addon.port.on("setProviders", (prvdrs) => {
    providers = prvdrs;
    addExploreProviders(
        Object.keys(providers)
        .filter((p) => providers[p].supports.featured)
    );
});

addon.port.on("setFeatured", (channels, type, q) => {
    if(type !== document.getElementById("exploreprovider").value ||
       (q !== null &&
        document.getElementById("searchField").value != q)
    )
        return;

    while(explore.hasChildNodes())
        explore.firstChild.remove();

    if(channels.length === 0) {
        show(document.getElementById("noresults"));
    }
    else {
        hide(document.getElementById("noresults"));
        channels.forEach((channel) => {
            explore.appendChild(buildChannel(channel, true));
        });
    }

    hideLoading();
    resize();
});

addon.port.on("theme", setTheme);

// Set up DOM listeners and all that.
window.addEventListener("load", function() {
    live = document.getElementById("live");
    offline = document.getElementById("offline");
    distinct = document.getElementById("nonlive");
    explore = document.getElementById("featured");
    secondaryLive = document.getElementById("secondarylive");
    var exploreSelect = document.getElementById("exploreprovider");
    var field = document.querySelector("#searchField");

    setStyle(addon.options.style);
    setExtrasVisibility(addon.options.extras);
    setNonLiveDisplay(addon.options.nonLiveDisplay);
    setTheme(addon.options.theme);
    resize();

    document.getElementById("configure").addEventListener("click", forwardEvent.bind(null, "configure"));
    document.getElementById("refreshButton").addEventListener("click", function(e) {
        forwardEvent("refresh", e);
        if(!explore.parentNode.hasAttribute("hidden"))
            getFeaturedChannels(exploreSelect.value);
    });
    document.getElementById("contextRefresh").addEventListener("click", contextMenuCommand.bind(null, "refresh"), false);
    document.getElementById("contextOpen").addEventListener("click", contextMenuCommand.bind(null, "openArchive"), false);
    document.getElementById("contextChat").addEventListener("click", contextMenuCommand.bind(null, "openChat"), false);
    document.getElementById("contextCopy").addEventListener("click", contextMenuCommand.bind(null, "copy"), false);
    document.getElementById("contextAdd").addEventListener("click", externalContextMenuCommand.bind(null, "add"), false);
    document.getElementById("contextExploreCopy").addEventListener("click", externalContextMenuCommand.bind(null, "copyexternal"), false);
    document.getElementById("pauseAutorefresh").addEventListener("click", () => addon.port.emit("pause"), false);
    document.getElementById("resumeAutorefresh").addEventListener("click", () => addon.port.emit("resume"), false);
    document.querySelector(".tabbed").addEventListener("tabchanged", (e) => {
        if(e.detail === 3)
            applySearchToExplore(exploreSelect, field);

        resize();
    }, false);
    exploreSelect.addEventListener("change", () => {
        applySearchToExplore(exploreSelect, field);
    }, false);
    document.querySelector("#searchButton").addEventListener("click", (e) => {
        e.preventDefault();
        if(field.hasAttribute("hidden")) {
            show(field);
            field.focus();
            e.currentTarget.setAttribute("aria-pressed", "true");
        }
        else {
            hide(field);
            field.value = "";
            filter(field.value, live, filters);
            filter(field.value, offline, filters);
            filter(field.value, secondaryLive, filters);
            e.currentTarget.setAttribute("aria-pressed", "false");
            field.blur();

            if(!explore.parentNode.hasAttribute("hidden"))
                applySearchToExplore(exploreSelect, field);
        }
        resize();
    }, false);
    field.addEventListener("keyup", (e) => {
        filter(field.value, live, filters);
        filter(field.value, offline, filters);
        filter(field.value, secondaryLive, filters);
        if(!explore.parentNode.hasAttribute("hidden"))
            applySearchToExplore(exploreSelect, field);
        else
            resize();
    }, false);

    addon.port.emit("ready");
});
