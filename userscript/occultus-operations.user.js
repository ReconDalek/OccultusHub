// ==UserScript==
// @name         Occultus Operations
// @namespace    Recon.Occultus.Operations
// @version      1.9.0
// @description  Occultus Faction Additions
// @author       Recon-
// @match        *://www.torn.com/*
// @noframes
// @run-at       document-end
// @icon         https://i.ibb.co/NZzxmfk/OccPent.png
// @grant        GM_xmlhttpRequest
// @connect      discord.com
// @connect      api.torn.com
// @connect      35.211.220.38
// @connect      occultushub-worker-production.rkilpatrick4221.workers.dev
// ==/UserScript==

(function () {
    'use strict';

    /**********************************************************
     * CONFIG
     **********************************************************/

    const ALLOWED_FACTION_IDS = [33097, 9171, 9728];
    const AUTH_CHECK_INTERVAL = 6 * 60 * 60 * 1000;
    const LAST_AUTH_STORAGE = "occultus_last_auth";
    const ICON_IMAGE = "https://i.ibb.co/NZzxmfk/OccPent.png";
    const XANAX_ICON = "/images/items/206/small.png";
    const BOT_URL = "http://35.211.220.38:8081";
    const API_BASE_URL = "https://occultushub-worker-production.rkilpatrick4221.workers.dev";
    const TARGET_RANKS = ["HARBINGER", "DOOMSAYER", "SENTINEL", "ARCANIST", "ADEPT"];
    const API_KEY_STORAGE = "occultus_api_key";
    const JWT_STORAGE = "occultus_jwt";
    const USER_STORAGE = "occultus_user_data";
    const FACTION_STORAGE = "occultus_faction_data";
    const FACTION_ID_STORAGE = "occultus_faction_id";
    const PANEL_OPEN_STORAGE = "occultus_panel_open";
    const FACTION_LABELS = { 33097: "Occ1", 9728: "Occ2", 9171: "Occ3" };
    const FACTION_ORDER = [33097, 9728, 9171];
    const PANEL_PREFS_STORAGE = "occultus_panel_prefs";
    const PANEL_BASE_TOP = 60;
    const PANEL_BASE_WIDTH = 260;
    const PANEL_BASE_HEIGHT = 500;
    const DEFAULT_PANEL_PREFS = { widthScale: 100, heightScale: 100, offsetX: 0, offsetY: 0, fontSize: 13, dockMode: "modal", sidebarSide: "right", sidebarHandleTop: 50 };
    const RAFFLE_REMOVAL_MODE = "all_tickets";
    const RAFFLE_SPIN_MIN_MS = 1400;
    const RAFFLE_WINNER_LINGER_MS = 4000;
    const RAFFLE_ITEM_ID = 283;
    const RAFFLE_ITEM_NAME = "Donator Pack";
    const RAFFLE_ITEM_URL = "https://www.torn.com/item.php#supply-pck-items";
    const RAFFLE_ITEM_TASK_STORAGE = "pending_raffle_item_task";
    const COUNCIL_ROLES = ["council", "archon", "leader", "co-leader"];
    // Fallbacks only — the real base quantity, item and per-rank / per-member
    // coefficients now come from occultusHub (Leadership → Ranks → Rank
    // Rewards) via /api/leadership/xanax. Used only if the server doesn't send them.
    const BASE_XANAX = 5;
    const DEFAULT_ITEM = { item_id: 206, item_name: "Xanax", armory_tab: "drugs" };
    const RANK_MODIFIERS = {
        "harbinger": 1.8,
        "doomsayer": 1.6,
        "sentinel": 1.4,
        "arcanist": 1.2,
        "adept": 1.0,
        "acolyte": 0
    };

    let botBusy = false;
    let isFilling = false;
    let lastCheck = 0;
    let currentRaffleFactionId = null;
    let currentRaffleRoundId = null;
    let currentWatcherRange = null;

    /**********************************************************
     * STYLES
     **********************************************************/

    const style = document.createElement("style");
    style.textContent = `
#occ-launcher { background: #005774 !important; border: none !important; cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 5px !important;  margin: 0 !important; height: auto !important; align-self: stretch !important; }
#occ-launcher img { width: 28px !important; height: 28px !important; display: block !important; transition: transform 1.5s linear; }
#occ-launcher:hover { background: #007ea0 !important; }
#occ-launcher:hover img { transform: rotate(360deg); }

#occ-panel { --occ-font-base: 13px; position: fixed; width: 260px; max-height: 500px; overflow-y: auto; overflow-x: hidden; background: rgba(15,15,15,0.95); color: #fff; border-radius: 8px; padding: 10px; font-family: Arial; font-size: var(--occ-font-base); z-index: 10000000; box-shadow: 0 0 12px black; display: none; left: 50%; transform: translateX(-50%); box-sizing: border-box; transition: none !important; }
#occ-panel::-webkit-scrollbar { width: 4px; }
#occ-panel::-webkit-scrollbar-thumb { background: #444; border-radius: 2px; }

#occ-resize-outline { position: fixed; display: none; box-sizing: border-box; border: 2px dashed #00ff9c; border-radius: 8px; background: rgba(0,255,156,0.06); pointer-events: none; z-index: 10000001; transition: none !important; }
#occ-header { position: relative; display: flex; justify-content: center; align-items: center; font-weight: bold; margin-bottom: 10px; padding: 0 20px; }
#occ-close { position: absolute; right: 0; top: -1; cursor: pointer; color: #ff6b6b; font-size: calc(var(--occ-font-base) + 3px); }

#occ-panel button { width: 100%; margin-top: 4px; padding: 8px; background: #5865F2; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity 0.2s; font-size: var(--occ-font-base); }
#occ-panel button.nav-btn { margin-top: 12px !important; }
#occ-panel button:hover { background: #4752c4; }
#occ-panel button.green-btn { background: #43b581; }
#occ-panel button.green-btn:hover { background: #3ca374; }
#occ-panel button.red-btn { background: #ff6b6b; }
#occ-panel button.red-btn:hover { background: #e55a5a; }
#occ-panel button:disabled { background: #444 !important; cursor: not-allowed; opacity: 0.7; }

#occ-status { margin-top: 8px; font-size: calc(var(--occ-font-base) - 2px); color: #00ff9c; text-align: center; }
#occ-settings { position: absolute; bottom: 6px; right: 9px; font-size: calc(var(--occ-font-base) + 5px); color: #bbb; cursor: pointer; user-select: none; }

#occ-member-list { margin-top: 5px; padding-right: 0 10px }
#occ-member-list button { margin: 4px 0 0 5px !important; width: calc(100% - 5px) !important; font-size: calc(var(--occ-font-base) - 1px); padding: 6px; }
.occ-rank-header { background: #222; color: #00ff9c; padding: 6px 10px; margin-top: 10px; font-weight: bold; font-size: calc(var(--occ-font-base) - 3px); border-left: 3px solid #00ff9c; display: flex !important; justify-content: space-between !important; align-items: center !important; box-sizing: border-box; width: calc(100% - 5px); }
.occ-rank-info { color: #888; font-weight: normal; flex-shrink: 0; margin-left: auto; text-align: right; }

.member-row { display: flex; gap: 4px; align-items: stretch; margin-top: 4px; width: 100%; }
.member-btn { flex: 1 1 auto; margin: 0 !important; font-size: calc(var(--occ-font-base) - 1px); padding: 6px; text-align: center; }
.check-btn { flex: 0 0 30px; margin: 0 !important; background: #3ca374; cursor: pointer; font-size: calc(var(--occ-font-base) + 3px); padding: 6px; display: flex; align-items: center; justify-content: center; }
.status-complete .member-btn { opacity: 0.3 !important; cursor: not-allowed !important; pointer-events: none; }
.status-complete .check-btn { background: #222 !important; opacity: 0.5; pointer-events: none; }
.status-warned .member-btn { background: #8b2e2e !important; color: #ccc !important; cursor: not-allowed !important; pointer-events: none; opacity: 0.8; }
.status-warned .check-btn { background: #5a1a1a !important; pointer-events: none; }
.status-visitor .member-btn { background: #2e3f5a !important; color: #9db8d8 !important; cursor: not-allowed !important; pointer-events: none; opacity: 0.8; }
.status-visitor .check-btn { background: #1a2740 !important; pointer-events: none; }

#occ-xan-footer { padding: 10px; border-top: 1px solid #333; margin-top: 10px; }

#occ-warn-list { margin-top: 5px; padding-right: 5px; }
.warn-item { background: #1a1a1a; border: 1px solid #333; padding: 8px; border-radius: 4px; margin-top: 6px; }
.warn-name { color: #ff6b6b; font-weight: bold; font-size: var(--occ-font-base); border-bottom: 1px solid #333; padding-bottom: 4px; margin-bottom: 4px; }
.warn-line { font-size: calc(var(--occ-font-base) - 2px); color: #bbb; display: flex; justify-content: space-between; }
.warn-val { color: #fff; font-weight: bold; }

#occ-faction-btn .occ-inline-icon {
    width: 16px !important;
    height: 16px !important;
    display: block !important;
    object-fit: contain !important;
    vertical-align: middle !important;
}

#occ-settings-menu-link {
    display: flex !important;
    align-items: center !important;
}


#occ-settings-menu-link .icon-wrapper {
transform: translateY(3px);

}


#occ-settings-menu-link .link-text {
    display: flex !important;
    align-items: center !important;
}


.settings-menu li.link a {
    display: flex;
    align-items: center;
}

#occ-settings-menu-link .occ-settings-icon {
    width: 18px !important;
    height: 18px !important;
}

.occ-faction-header {
    background: #1a1a2e;
    color: #c084fc;
    padding: 8px 10px;
    margin-top: 8px;
    font-weight: bold;
    font-size: calc(var(--occ-font-base) - 2px);
    border-left: 3px solid #c084fc;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-radius: 3px;
    user-select: none;
    width: calc(100% - 5px);
    box-sizing: border-box;
}
.occ-faction-header:hover { background: #252540; }
.occ-faction-header .faction-arrow { transition: transform 0.2s; font-size: calc(var(--occ-font-base) - 3px); }
.occ-faction-header.open .faction-arrow { transform: rotate(90deg); }
.occ-faction-body { display: none; }
.occ-faction-body.open { display: block; }

.occ-slider-group { margin-top: 12px; }
.occ-slider-group label { display: flex; justify-content: space-between; font-size: calc(var(--occ-font-base) - 2px); color: #bbb; margin-bottom: 4px; }
.occ-slider-group label span { color: #00ff9c; font-weight: bold; }
.occ-slider-group input[type="range"] { width: 100%; accent-color: #5865F2; cursor: pointer; }
#occ-settings-page .nav-btn { margin-top: 16px !important; }

#occ-panel select, #occ-panel input[type="datetime-local"], #occ-panel input[type="date"] { width: 100%; margin-top: 4px; padding: 6px; background: #1a1a1a; color: #fff; border: 1px solid #333; border-radius: 4px; font-size: calc(var(--occ-font-base) - 1px); box-sizing: border-box; }

#occ-panel.occ-sidebar-mode {
    border-radius: 8px 0 0 8px !important;
    transform: translateX(105%) !important;
    transition: transform 0.25s ease !important;
}
#occ-panel.occ-sidebar-mode.occ-side-left {
    border-radius: 0 8px 8px 0 !important;
    transform: translateX(-105%) !important;
}
#occ-panel.occ-sidebar-mode.occ-sidebar-open { transform: translateX(0) !important; }

#occ-edge-tab {
    position: fixed;
    background: #005774;
    color: #fff;
    padding: 14px 4px;
    cursor: grab;
    touch-action: none;
    z-index: 9999999;
    writing-mode: vertical-rl;
    font-size: 12px;
    font-weight: bold;
    letter-spacing: 1px;
    user-select: none;
    display: none;
}
#occ-edge-tab:hover { background: #007ea0; }

#occ-raffle-info { font-size: calc(var(--occ-font-base) - 1px); color: #bbb; text-align: center; margin-bottom: 6px; }
.occ-raffle-row { display: flex; justify-content: space-between; padding: 4px 8px; background: #1a1a1a; border-radius: 3px; margin-top: 4px; font-size: calc(var(--occ-font-base) - 2px); }
.occ-raffle-winner { color: #ffd700; font-weight: bold; }
#occ-raffle-reel { margin: 10px 0; height: 40px; display: flex; align-items: center; justify-content: center; background: #000; border: 2px solid #5865F2; border-radius: 6px; font-weight: bold; font-size: calc(var(--occ-font-base) + 2px); color: #00ff9c; overflow: hidden; white-space: nowrap; }
#occ-raffle-reel.spinning { animation: occ-reel-flicker 0.12s linear infinite; }
@keyframes occ-reel-flicker { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
.occ-raffle-send-btn { width: auto !important; margin: 0 !important; padding: 3px 8px !important; font-size: calc(var(--occ-font-base) - 3px) !important; }

.occ-pending-row { background: #2a1f0a; border-left: 3px solid #fbbf24; border-radius: 4px; padding: 6px 8px; margin-top: 6px; }
.occ-pending-info { font-size: calc(var(--occ-font-base) - 2px); color: #ddd; }
.occ-pending-note { color: #fbbf24; font-style: italic; }
.occ-pending-actions { display: flex; gap: 4px; margin-top: 4px; }
.occ-pending-btn { width: auto !important; flex: 1; margin: 0 !important; padding: 4px 6px !important; font-size: calc(var(--occ-font-base) - 3px) !important; }
.occ-pending-include { background: #43b581 !important; }
.occ-pending-exclude { background: #ff6b6b !important; }

`;
    document.head.appendChild(style);

    /**********************************************************
     * PANEL & UI
     **********************************************************/

    function createPanel() {
    if (!document.getElementById("occ-panel")) {

    const panel = document.createElement("div");
    panel.id = "occ-panel";
    panel.innerHTML = `
<div id="occ-header">
    <span id="occ-title">Occult Operations</span>
    <span id="occ-close">✖</span>
</div>

<div id="occ-main-page">
    <button id="occ-assist">Assist Attack</button>
    <button id="occ-withdraw">Withdraw Funds</button>
    <button id="occ-council-btn" class="green-btn" style="display:none;">Council Actions</button>
    <div id="occ-status">Ready</div>
    <div id="occ-settings">🛠</div>
</div>

<div id="occ-council-page" style="display:none;">
    <button id="occ-monthly-xanax"><img src="${XANAX_ICON}" class="xan-icon">Monthly Xanax</button>
    <button id="occ-watcher-xanax"><img src="${XANAX_ICON}" class="xan-icon">Watcher Xanax</button>
    <button id="occ-chain-raffle">🎰 Chain Raffle</button>
    <button id="occ-warnings-btn">⚠️ Warnings</button>
    <button id="occ-back-to-main" class="red-btn nav-btn">⬅ Back</button>
</div>

<div id="occ-xanax-page" style="display:none;">
    <div id="occ-member-list"></div>
    <button id="occ-xan-back" class="red-btn nav-btn">⬅ Back</button>
</div>

<div id="occ-watcher-xanax-page" style="display:none;">
    <div class="occ-slider-group" style="margin-top:0;">
        <label>Faction</label>
        <select id="occ-watcher-faction">
            <option value="all" selected>All Factions</option>
            <option value="33097">Occ1</option>
            <option value="9728">Occ2</option>
            <option value="9171">Occ3</option>
        </select>
    </div>
    <div class="occ-slider-group">
        <label>Range</label>
        <select id="occ-watcher-range">
            <option value="month" selected>This Month</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">All Time</option>
            <option value="custom">Custom Dates…</option>
        </select>
    </div>
    <div id="occ-watcher-custom-range" style="display:none;">
        <div class="occ-slider-group">
            <label>From</label>
            <input type="date" id="occ-watcher-from">
        </div>
        <div class="occ-slider-group">
            <label>To</label>
            <input type="date" id="occ-watcher-to">
        </div>
        <button id="occ-watcher-apply-range" class="green-btn">Apply</button>
    </div>
    <div id="occ-watcher-pending"></div>
    <div id="occ-watcher-list"></div>
    <button id="occ-watcher-back" class="red-btn nav-btn">⬅ Back</button>
</div>

<div id="occ-raffle-page" style="display:none;">
    <div id="occ-raffle-body"></div>
    <button id="occ-raffle-draw-btn" class="green-btn">🎰 Draw Winner</button>
    <button id="occ-raffle-new-btn">➕ New Round</button>
    <div id="occ-raffle-create-form" style="display:none;">
        <div class="occ-slider-group">
            <label>Period Start</label>
            <input type="datetime-local" id="occ-raffle-start">
        </div>
        <div class="occ-slider-group">
            <label>Period End</label>
            <input type="datetime-local" id="occ-raffle-end">
        </div>
        <div class="occ-slider-group">
            <label>Draws <span id="occ-raffle-drawcount-val">1</span></label>
            <input type="range" id="occ-raffle-drawcount" min="1" max="10" step="1" value="1">
        </div>
        <button id="occ-raffle-create-confirm" class="green-btn">Create Round</button>
        <button id="occ-raffle-create-cancel" class="red-btn">Cancel</button>
    </div>
    <button id="occ-raffle-refresh">🔄 Refresh</button>
    <button id="occ-raffle-back" class="red-btn nav-btn">⬅ Back</button>
</div>

<div id="occ-warnings-page" style="display:none;">
    <div id="occ-warn-list"></div>
    <button id="occ-warn-back" class="red-btn nav-btn">⬅ Back</button>
</div>

<div id="occ-settings-page" style="display:none;">
    <div class="occ-slider-group">
        <label>Width <span id="occ-width-val">100%</span></label>
        <input type="range" id="occ-width-slider" min="50" max="300" step="5" value="100">
    </div>
    <div class="occ-slider-group" id="occ-height-group">
        <label>Height <span id="occ-height-val">100%</span></label>
        <input type="range" id="occ-height-slider" min="50" max="300" step="5" value="100">
    </div>
    <div class="occ-slider-group" id="occ-x-group">
        <label>Horizontal Position <span id="occ-x-val">0</span></label>
        <input type="range" id="occ-x-slider" min="-200" max="200" step="5" value="0">
    </div>
    <div class="occ-slider-group" id="occ-y-group">
        <label>Vertical Position <span id="occ-y-val">0</span></label>
        <input type="range" id="occ-y-slider" min="-50" max="400" step="5" value="0">
    </div>
    <div class="occ-slider-group">
        <label>Font Size <span id="occ-font-val">13px</span></label>
        <input type="range" id="occ-font-slider" min="10" max="20" step="1" value="13">
    </div>
    <div class="occ-slider-group">
        <label>Popout Sidebar Mode</label>
        <button id="occ-dockmode-toggle" type="button">Enable Sidebar Mode</button>
    </div>
    <button id="occ-reset-layout" class="red-btn">Reset Size/Position</button>
    <button id="occ-update-api">Update API Key</button>
    <button id="occ-save-settings" class="green-btn nav-btn">Save</button>
</div>
`;
        document.body.appendChild(panel);

        // If the edge tab survived while the panel itself got rebuilt, its
        // gesture handlers below would still be bound to the OLD (now
        // detached) panel reference — clear the flag so they rebind fresh.
        const survivingTab = document.getElementById("occ-edge-tab");
        if (survivingTab) delete survivingTab.dataset.bound;

        document.getElementById("occ-close").onclick = closePanel;
        document.getElementById("occ-assist").onclick = assistAttack;
        document.getElementById("occ-withdraw").onclick = withdrawFunds;
        document.getElementById("occ-council-btn").onclick = openCouncil;
        document.getElementById("occ-back-to-main").onclick = showMainPage;
        document.getElementById("occ-settings").onclick = openSettings;
        document.getElementById("occ-save-settings").onclick = showMainPage;
        document.getElementById("occ-monthly-xanax").onclick = fetchAndShowMembers;
        document.getElementById("occ-xan-back").onclick = openCouncil;
        document.getElementById("occ-watcher-xanax").onclick = fetchAndShowWatcherXanax;
        document.getElementById("occ-watcher-back").onclick = openCouncil;
        document.getElementById("occ-watcher-faction").onchange = handleWatcherFactionChange;
        document.getElementById("occ-watcher-range").onchange = handleWatcherRangeChange;
        document.getElementById("occ-watcher-apply-range").onclick = fetchAndShowWatcherXanax;
        document.getElementById("occ-chain-raffle").onclick = fetchAndShowRaffle;
        document.getElementById("occ-raffle-back").onclick = openCouncil;
        document.getElementById("occ-raffle-refresh").onclick = () => currentRaffleFactionId && loadRaffleRound(currentRaffleFactionId);
        document.getElementById("occ-raffle-draw-btn").onclick = drawRaffleWinner;
        document.getElementById("occ-raffle-new-btn").onclick = openRaffleCreateForm;
        document.getElementById("occ-raffle-create-cancel").onclick = () => {
            document.getElementById("occ-raffle-create-form").style.display = "none";
        };
        document.getElementById("occ-raffle-create-confirm").onclick = createRaffleRound;
        document.getElementById("occ-raffle-drawcount").oninput = (e) => {
            document.getElementById("occ-raffle-drawcount-val").textContent = e.target.value;
        };
        document.getElementById("occ-raffle-body").addEventListener("click", (e) => {
            const sendBtn = e.target.closest(".occ-raffle-send-btn");
            if (!sendBtn) return;
            sendRaffleItem(parseInt(sendBtn.dataset.userId, 10), sendBtn.dataset.username, sendBtn.dataset.message);
        });
        document.getElementById("occ-watcher-pending").addEventListener("click", (e) => {
            const reviewBtn = e.target.closest(".occ-pending-btn");
            if (!reviewBtn) return;
            reviewWatcherShift(parseInt(reviewBtn.dataset.shiftId, 10), reviewBtn.dataset.decision);
        });
        document.getElementById("occ-update-api").onclick = manualUpdateKey;
        document.getElementById("occ-warnings-btn").onclick = fetchAndShowWarnings;
        document.getElementById("occ-warn-back").onclick = openCouncil;
        document.getElementById("occ-reset-layout").onclick = resetPanelPrefs;
        document.getElementById("occ-dockmode-toggle").onclick = toggleDockMode;

        const widthSlider = document.getElementById("occ-width-slider");
        const heightSlider = document.getElementById("occ-height-slider");
        const xSlider = document.getElementById("occ-x-slider");
        const ySlider = document.getElementById("occ-y-slider");
        const fontSlider = document.getElementById("occ-font-slider");

        widthSlider.oninput = (e) => { updateLivePanelPref("widthScale", parseInt(e.target.value, 10)); showResizeOutline(); };
        heightSlider.oninput = (e) => { updateLivePanelPref("heightScale", parseInt(e.target.value, 10)); showResizeOutline(); };
        xSlider.oninput = (e) => updateLivePanelPref("offsetX", parseInt(e.target.value, 10));
        ySlider.oninput = (e) => updateLivePanelPref("offsetY", parseInt(e.target.value, 10));
        fontSlider.oninput = (e) => updateLivePanelPref("fontSize", parseInt(e.target.value, 10));

        // Persist to storage only once the user lets go of the slider.
        [widthSlider, heightSlider, xSlider, ySlider, fontSlider].forEach(slider => {
            slider.onchange = persistPanelPrefs;
        });
        widthSlider.addEventListener("change", hideResizeOutline);
        heightSlider.addEventListener("change", hideResizeOutline);

    }

    // These three run every time createPanel() is called (not just the first
    // time) — each is independently idempotent, so this re-creates anything
    // that went missing (e.g. the host page's own re-render touched
    // document.body and silently dropped our appended nodes) without
    // rebuilding the whole panel.
    //
    // Sibling of the panel (not a child) so it isn't clipped by the panel's
    // own overflow:auto when the target size exceeds it.
    if (!document.getElementById("occ-resize-outline")) {
        const outline = document.createElement("div");
        outline.id = "occ-resize-outline";
        document.body.appendChild(outline);
    }

    // Edge tab — sibling of the panel, always present but only shown (via
    // CSS) once Sidebar Mode is enabled in Settings.
    if (!document.getElementById("occ-edge-tab")) {
        const edgeTab = document.createElement("div");
        edgeTab.id = "occ-edge-tab";
        edgeTab.textContent = "⟨ OPS ⟩";
        document.body.appendChild(edgeTab);
    }

    setupEdgeTabGestures();
    }

    /**********************************************************
     * PANEL LAYOUT PREFS (size + position, remembered per-device)
     **********************************************************/

    // Kept in memory so dragging a slider only touches localStorage once
    // (on release) instead of on every 'input' tick — JSON parsing +
    // synchronous localStorage writes dozens of times a second during a
    // drag is what was causing the position/size jank.
    //
    // Loaded from storage in init(), not here — confirmed (via logging) that
    // reading PANEL_PREFS_STORAGE this early, at top-level script
    // evaluation, intermittently returns the default/empty state even when
    // the exact same key reads back correctly moments later inside init().
    // A placeholder here avoids a brief window of undefined behavior before
    // init() assigns the real value.
    let panelPrefs = { ...DEFAULT_PANEL_PREFS };

    function loadStoredPanelPrefs() {
        try {
            const stored = JSON.parse(SafeStore.get(PANEL_PREFS_STORAGE));
            if (stored) return { ...DEFAULT_PANEL_PREFS, ...stored };
        } catch (e) { /* fall through to defaults */ }
        return { ...DEFAULT_PANEL_PREFS };
    }

    function persistPanelPrefs() {
        SafeStore.set(PANEL_PREFS_STORAGE, JSON.stringify(panelPrefs));
    }

    // Clamps the target size to the viewport (minus a small margin) so an
    // oversized panel can never itself force scrolling/overflow of the page.
    // Sidebar mode uses the same width/height sliders as modal mode — only
    // its position differs (docked to an edge, centered on the handle).
    function panelTargetBox(prefs) {
        const idealWidth = Math.round(PANEL_BASE_WIDTH * prefs.widthScale / 100);
        const idealHeight = Math.round(PANEL_BASE_HEIGHT * prefs.heightScale / 100);
        return {
            width: Math.min(idealWidth, window.innerWidth - 20),
            height: Math.min(idealHeight, window.innerHeight - 20)
        };
    }

    // Plain pixel left/top clamped so the box can never sit past any edge of
    // the window. Sidebar mode docks flush to whichever edge the handle is
    // on, vertically centered on the handle's own position (sidebarHandleTop,
    // a % of viewport height) — open/closed state is handled separately via
    // the .occ-sidebar-open class.
    function panelClampedPosition(prefs, box) {
        if (prefs.dockMode === "sidebar") {
            const handleCenterY = (prefs.sidebarHandleTop / 100) * window.innerHeight;
            const top = Math.max(0, Math.min(handleCenterY - box.height / 2, window.innerHeight - box.height));
            const left = prefs.sidebarSide === "left" ? 0 : window.innerWidth - box.width;
            return { left, top };
        }
        const left = Math.max(0, Math.min((window.innerWidth - box.width) / 2 + prefs.offsetX, window.innerWidth - box.width));
        const top = Math.max(0, Math.min(PANEL_BASE_TOP + prefs.offsetY, window.innerHeight - box.height));
        return { left, top };
    }

    // Positions the edge tab/handle itself — independent of whether the panel
    // is currently open, so it stays put (and draggable) either way.
    function applyEdgeTabPosition() {
        const tab = document.getElementById("occ-edge-tab");
        if (!tab) return;
        const top = Math.max(0, Math.min((panelPrefs.sidebarHandleTop / 100) * window.innerHeight, window.innerHeight));
        tab.style.top = `${top}px`;
        tab.style.transform = "translateY(-50%)";
        if (panelPrefs.sidebarSide === "left") {
            tab.style.left = "0";
            tab.style.right = "auto";
            tab.style.borderRadius = "0 6px 6px 0";
            tab.style.boxShadow = "2px 0 6px rgba(0,0,0,0.5)";
        } else {
            tab.style.right = "0";
            tab.style.left = "auto";
            tab.style.borderRadius = "6px 0 0 6px";
            tab.style.boxShadow = "-2px 0 6px rgba(0,0,0,0.5)";
        }
    }

    function applyPanelPrefs() {
        const panel = document.getElementById("occ-panel");
        if (!panel) return;
        const sidebar = panelPrefs.dockMode === "sidebar";
        panel.classList.toggle("occ-sidebar-mode", sidebar);
        panel.classList.toggle("occ-side-left", sidebar && panelPrefs.sidebarSide === "left");

        const box = panelTargetBox(panelPrefs);
        const pos = panelClampedPosition(panelPrefs, box);

        // Plain pixel left/top — no transform involved, which is what was
        // causing the horizontal jitter (translateX(-50%) recalculating
        // against the box's own width on every tick during a drag).
        panel.style.top = `${pos.top}px`;
        panel.style.left = `${pos.left}px`;
        // Sidebar mode's open/closed slide is owned by the .occ-sidebar-mode /
        // .occ-sidebar-open CSS classes (!important) — an inline transform
        // here would just fight that, so leave it unset.
        if (sidebar) panel.style.removeProperty("transform");
        else panel.style.transform = "none";

        // Size changes the panel's actual box (width + scrollable max-height)
        // rather than a CSS scale, so content reflows/scrolls instead of stretching.
        panel.style.width = `${box.width}px`;
        panel.style.maxHeight = `${box.height}px`;

        // Font size is a base value — elements with a larger/smaller size than
        // the base keep their fixed calc() offset from it, so relative hierarchy
        // (e.g. a heading 2px bigger than body text) is preserved as it scales.
        panel.style.setProperty("--occ-font-base", `${panelPrefs.fontSize}px`);

        const edgeTab = document.getElementById("occ-edge-tab");
        if (edgeTab) {
            edgeTab.style.display = sidebar ? "block" : "none";
            if (sidebar) applyEdgeTabPosition();
        }
    }

    // Live preview while dragging: updates the in-memory value + the panel's
    // own styles only. No localStorage I/O here — see persistPanelPrefs().
    function updateLivePanelPref(key, value) {
        panelPrefs[key] = value;
        applyPanelPrefs();

        const labelIds = { widthScale: "occ-width-val", heightScale: "occ-height-val", offsetX: "occ-x-val", offsetY: "occ-y-val", fontSize: "occ-font-val" };
        const labelEl = document.getElementById(labelIds[key]);
        if (!labelEl) return;
        if (key === "widthScale" || key === "heightScale") labelEl.textContent = `${value}%`;
        else if (key === "fontSize") labelEl.textContent = `${value}px`;
        else labelEl.textContent = value;
    }

    function syncPanelPrefSliders() {
        panelPrefs = loadStoredPanelPrefs();
        document.getElementById("occ-width-slider").value = panelPrefs.widthScale;
        document.getElementById("occ-width-val").textContent = `${panelPrefs.widthScale}%`;
        document.getElementById("occ-height-slider").value = panelPrefs.heightScale;
        document.getElementById("occ-height-val").textContent = `${panelPrefs.heightScale}%`;
        document.getElementById("occ-x-slider").value = panelPrefs.offsetX;
        document.getElementById("occ-x-val").textContent = panelPrefs.offsetX;
        document.getElementById("occ-y-slider").value = panelPrefs.offsetY;
        document.getElementById("occ-y-val").textContent = panelPrefs.offsetY;
        document.getElementById("occ-font-slider").value = panelPrefs.fontSize;
        document.getElementById("occ-font-val").textContent = `${panelPrefs.fontSize}px`;
        updateDockModeUI();
    }

    // Reset Size/Position intentionally leaves dockMode/sidebarSide/
    // sidebarHandleTop alone — Sidebar Mode and where its handle sits are
    // feature opt-ins, not part of the size/position layout being reset.
    function resetPanelPrefs() {
        const { dockMode, sidebarSide, sidebarHandleTop } = panelPrefs;
        panelPrefs = { ...DEFAULT_PANEL_PREFS, dockMode, sidebarSide, sidebarHandleTop };
        persistPanelPrefs();
        applyPanelPrefs();
        syncPanelPrefSliders();
        hideResizeOutline();
        setStatus("Layout reset to default");
    }

    function toggleDockMode() {
        panelPrefs.dockMode = panelPrefs.dockMode === "sidebar" ? "modal" : "sidebar";
        persistPanelPrefs();
        applyPanelPrefs();
        updateDockModeUI();
        setStatus(panelPrefs.dockMode === "sidebar" ? "Sidebar Mode enabled" : "Sidebar Mode disabled");
    }

    // The horizontal position sliders don't apply once docked to an edge
    // (the handle drag owns that), so hide just those. Height still matters
    // — the panel is centered on the handle at whatever height is set.
    function updateDockModeUI() {
        const sidebar = panelPrefs.dockMode === "sidebar";
        const btn = document.getElementById("occ-dockmode-toggle");
        if (btn) {
            btn.textContent = sidebar ? "Sidebar Mode: ON" : "Enable Sidebar Mode";
            btn.className = sidebar ? "green-btn" : "";
        }
        ["occ-x-group", "occ-y-group"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = sidebar ? "none" : "";
        });
    }

    // Edge tab: tap (no real movement) toggles the sidebar open/closed.
    // Drag it to relocate — vertical movement repositions it along the edge
    // (the panel re-centers on it), and dragging far enough across the
    // screen flips it (and the panel) to the opposite edge. Swiping the open
    // panel back towards its edge closes it. All only relevant once Sidebar
    // Mode is on (the tab is hidden otherwise).
    function setupEdgeTabGestures() {
        const tab = document.getElementById("occ-edge-tab");
        const panel = document.getElementById("occ-panel");
        if (!tab || !panel || tab.dataset.bound) return;
        tab.dataset.bound = "1";

        let dragging = false;
        let moved = false;
        let startX = 0, startY = 0, startTop = 50;

        tab.addEventListener("pointerdown", (e) => {
            dragging = true;
            moved = false;
            startX = e.clientX;
            startY = e.clientY;
            startTop = panelPrefs.sidebarHandleTop;
            tab.style.cursor = "grabbing";
            tab.setPointerCapture?.(e.pointerId);
        });

        tab.addEventListener("pointermove", (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (!moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) moved = true;
            if (!moved) return;

            panelPrefs.sidebarHandleTop = Math.max(4, Math.min(96, startTop + (dy / window.innerHeight) * 100));

            // Checked against the CURRENT side (not frozen at drag-start), so
            // reversing direction mid-drag can flip it back before release.
            const flipThreshold = window.innerWidth * 0.35;
            if (panelPrefs.sidebarSide === "right" && -dx > flipThreshold) panelPrefs.sidebarSide = "left";
            else if (panelPrefs.sidebarSide === "left" && dx > flipThreshold) panelPrefs.sidebarSide = "right";

            applyEdgeTabPosition();
            if (panel.classList.contains("occ-sidebar-open")) applyPanelPrefs();
        });

        const endDrag = () => {
            if (!dragging) return;
            dragging = false;
            tab.style.cursor = "grab";
            if (moved) { persistPanelPrefs(); applyPanelPrefs(); }
        };

        tab.addEventListener("pointerup", async () => {
            const wasMoved = moved;
            endDrag();
            if (!wasMoved) {
                const key = await validateAndSaveKey();
                if (key) togglePanel();
            }
        });
        tab.addEventListener("pointercancel", endDrag);

        let panelStartX = null;
        panel.addEventListener("touchstart", (e) => { panelStartX = e.touches[0].clientX; }, { passive: true });
        panel.addEventListener("touchend", (e) => {
            if (panelStartX == null) return;
            const dx = e.changedTouches[0].clientX - panelStartX;
            panelStartX = null;
            const closedTowardsEdge = panelPrefs.sidebarSide === "left" ? dx < -60 : dx > 60;
            if (closedTowardsEdge && panelPrefs.dockMode === "sidebar" && panel.classList.contains("occ-sidebar-open")) {
                closePanel();
            }
        }, { passive: true });
    }

    /**********************************************************
     * RESIZE OUTLINE (visual "max size" preview while dragging
     * the width/height sliders — the settings page itself is short,
     * so without this there's no visible feedback that anything moved)
     **********************************************************/

    function showResizeOutline() {
        const outline = document.getElementById("occ-resize-outline");
        if (!outline) return;
        const box = panelTargetBox(panelPrefs);
        const pos = panelClampedPosition(panelPrefs, box);

        outline.style.top = `${pos.top}px`;
        outline.style.left = `${pos.left}px`;
        outline.style.transform = "none";
        outline.style.width = `${box.width}px`;
        outline.style.height = `${box.height}px`;
        outline.style.display = "block";
    }

    function hideResizeOutline() {
        const outline = document.getElementById("occ-resize-outline");
        if (outline) outline.style.display = "none";
    }

    function showMainPage() {
        hideAllPages();
        document.getElementById("occ-main-page").style.display = "block";
        document.getElementById("occ-title").textContent = "Occult Operations";
    }

    function openCouncil() {
        hideAllPages();
        document.getElementById("occ-council-page").style.display = "block";
        document.getElementById("occ-title").textContent = "Council Actions";
    }

    function openSettings() {
        hideAllPages();
        document.getElementById("occ-settings-page").style.display = "block";
        document.getElementById("occ-title").textContent = "Settings";
        syncPanelPrefSliders();
    }

    function hideAllPages() {
    ["occ-main-page", "occ-council-page", "occ-xanax-page", "occ-watcher-xanax-page", "occ-raffle-page", "occ-warnings-page", "occ-settings-page"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });
    }

    function addFactionOperationsButton() {
        // Only run on the faction page
        if (!location.href.includes("factions.php?step=your")) return;

        // Prevent duplicates
        if (document.getElementById("occ-faction-btn")) return;

        const linksList = document.querySelector("#top-page-links-list");
        if (!linksList) return;

        const factionWarfareBtn = linksList.querySelector("a.view-wars");
        if (!factionWarfareBtn) return;

        const btn = document.createElement("a");
        btn.id = "occ-faction-btn";
        btn.className = "t-clear h c-pointer m-icon line-h24 right";
        btn.href = "#";
        btn.title = "Occultus Operations";

        btn.innerHTML = `
            <span class="icon-wrap svg-icon-wrap">
                <span class="link-icon-svg">
                    <img src="${ICON_IMAGE}" alt="Operations" class="occ-inline-icon">
                </span>
            </span>
            <span>Operations</span>
        `;

        btn.addEventListener("click", openOccultusPanel);

        // Insert directly left of Faction Warfare
        linksList.insertBefore(btn, factionWarfareBtn);
    }

    function addSettingsOperationsEntry() {
        // Prevent duplicates
        if (document.getElementById("occ-settings-menu-link")) return;

        const settingsMenu = document.querySelector("ul.settings-menu");
        if (!settingsMenu) return;

        const profileLi = Array.from(settingsMenu.querySelectorAll("li.link")).find(li => {
            const a = li.querySelector('a[href*="/profiles.php"]');
            return !!a;
        });

        if (!profileLi) return;

        const newLi = document.createElement("li");
        newLi.className = "link occ-settings-entry";

        newLi.innerHTML = `
            <a href="#" id="occ-settings-menu-link" title="Occultus Operations">
                <div class="icon-wrapper">
                    <img src="${ICON_IMAGE}" alt="Operations" class="occ-settings-icon">
                </div>
                <span class="link-text">Operations</span>
            </a>
        `;

        const link = newLi.querySelector("#occ-settings-menu-link");
        link.addEventListener("click", openOccultusPanel);

        // Insert directly beneath View Profile
        profileLi.insertAdjacentElement("afterend", newLi);
    }


    async function openOccultusPanel(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const key = await validateAndSaveKey();
    if (key) togglePanel();
    }

     /**********************************************************
     * STORAGE FAILSAFE
     **********************************************************/

    const SafeStore = {
    get: (key) => {
        try { return localStorage.getItem(key); }
        catch(e) { console.error("Occultus: Storage Read Blocked", e); return null; }
    },
    set: (key, val) => {
        try { localStorage.setItem(key, val); }
        catch(e) { console.error("Occultus: Storage Write Blocked (Full/Locked)", e); }
    },
    remove: (key) => {
        try { localStorage.removeItem(key); }
        catch(e) { console.error("Occultus: Storage Delete Blocked", e); }
    }
    };

    /**********************************************************
     * BACKEND API LOGIC (occultusHub — replaces Google Sheets)
     **********************************************************/

    function apiRequest(method, path, body, jwt) {
        return new Promise(resolve => {
            const headers = { "Content-Type": "application/json" };
            if (jwt) headers.Authorization = "Bearer " + jwt;

            GM_xmlhttpRequest({
                method,
                url: `${API_BASE_URL}${path}`,
                headers,
                data: body ? JSON.stringify(body) : undefined,
                timeout: 15000,
                onload: (res) => {
                    let data = null;
                    try { data = JSON.parse(res.responseText); } catch (e) { /* non-JSON response */ }
                    resolve({ status: res.status, data });
                },
                onerror: () => resolve({ status: 0, data: null }),
                ontimeout: () => resolve({ status: 0, data: null })
            });
        });
    }

    // Exchanges the Torn API key for a backend JWT (server independently
    // re-validates the key + faction/leadership status against Torn's API).
    async function loginToBackend(key) {
        const res = await apiRequest("POST", "/api/auth/login", { apiKey: key });
        if (res.status === 200 && res.data?.token) {
            SafeStore.set(JWT_STORAGE, res.data.token);
            return res.data.token;
        }
        console.error("Occultus: Backend login failed", res);
        return null;
    }

    async function fetchAndShowMembers() {
    const globalCooldown = sessionStorage.getItem("occ_global_cooldown");
    if (globalCooldown && Date.now() < parseInt(globalCooldown)) {
        setStatus("System Cooling Down...", true);
        return;
    }

    const jwt = SafeStore.get(JWT_STORAGE);
    if (!jwt) {
        setStatus("Not authenticated — reopen panel", true);
        return;
    }

    const xanBtn = document.getElementById("occ-monthly-xanax");
    const originalContent = xanBtn.innerHTML;

    xanBtn.disabled = true;
    xanBtn.textContent = "⏳ Loading Members...";
    setStatus("Fetching members...");

    const res = await apiRequest("GET", "/api/leadership/xanax", null, jwt);

    xanBtn.disabled = false;
    xanBtn.innerHTML = originalContent;

    if (res.status === 429) {
        sessionStorage.setItem("occ_global_cooldown", Date.now() + (5 * 60 * 1000));
        setStatus("Rate Limited - 5m Cooldown", true);
        return;
    }
    if (res.status !== 200 || !res.data?.members) {
        setStatus("Fetch Error: " + res.status, true);
        return;
    }

    const listContainer = document.getElementById("occ-member-list");
    listContainer.innerHTML = "";

    // Reward config from the site (base quantity, item, rank coefficients).
    const settings = { ...DEFAULT_ITEM, base_quantity: BASE_XANAX, ...(res.data.settings || {}) };
    const rankCoef = {};
    (res.data.ranks || []).forEach(r => { rankCoef[r.rank_name.toLowerCase()] = r.coefficient; });
    const itemName = settings.item_name;

    // --- Build faction → rank → members map ---
    // Grouped by derived_rank (earned via hits — see xanaxController.js),
    // not the member's real Torn faction_position, so council/archon/
    // co-leader/leader members still show up under the rank they've earned.
    const factionMap = {};
    res.data.members.forEach(m => {
        const matchedRank = TARGET_RANKS.find(r => r.toLowerCase() === (m.derived_rank || "").toLowerCase());
        if (!matchedRank) return;

        const faction = m.faction_id;
        if (!factionMap[faction]) factionMap[faction] = {};
        if (!factionMap[faction][matchedRank]) factionMap[faction][matchedRank] = [];
        factionMap[faction][matchedRank].push(m);
    });

    let totalFound = 0;

    // Render each faction as a collapsible section, in fixed Occ1/Occ2/Occ3 order
    // (Object.keys would sort these numeric-looking IDs lexicographically, giving
    // 33097, 9171, 9728 — wrong order — so iterate an explicit list instead).
    FACTION_ORDER.forEach(factionId => {
        if (!factionMap[factionId]) return;
        const memberCount = Object.values(factionMap[factionId]).reduce((sum, arr) => sum + arr.length, 0);
        const factionLabel = FACTION_LABELS[factionId] || factionId;

        const factionHeader = document.createElement("div");
        factionHeader.className = "occ-faction-header";
        factionHeader.innerHTML = `
            <span>${factionLabel} <span style="color:#888; font-weight:normal;">(${memberCount})</span></span>
            <span class="faction-arrow">▶</span>
        `;

        const factionBody = document.createElement("div");
        factionBody.className = "occ-faction-body";

        factionHeader.addEventListener("click", () => {
            factionHeader.classList.toggle("open");
            factionBody.classList.toggle("open");
        });

        TARGET_RANKS.forEach(targetRank => {
            const membersInRank = factionMap[factionId][targetRank];
            if (!membersInRank || membersInRank.length === 0) return;

            const rankKey = targetRank.toLowerCase();
            const mod = rankCoef[rankKey] ?? RANK_MODIFIERS[rankKey] ?? 1.0;
            const rankQty = Math.floor(settings.base_quantity * mod + 1e-9);

            const header = document.createElement("div");
            header.className = "occ-rank-header";
            header.innerHTML = `<span>${targetRank}S</span><span class="occ-rank-info">x${mod.toFixed(1)} (${rankQty} ${itemName})</span>`;
            factionBody.appendChild(header);

            membersInRank.forEach(m => {
                const userId = m.torn_user_id;
                const name = m.username;
                // Per-member quantity from the site (rank coefficient + any
                // energy bonus); falls back to the rank's own amount.
                const calcQty = Number.isFinite(m.quantity) ? m.quantity : rankQty;
                const bonus = m.energy_bonus || 0;

                const rowWrapper = document.createElement("div");
                rowWrapper.className = "member-row";

                const btn = document.createElement("button");
                btn.className = "member-btn";
                btn.textContent = bonus ? `${name} ⚡+${bonus} → ${calcQty}` : name;
                if (bonus) btn.title = `Energy bonus: averaged ${m.avg_energy}/day last month (≥ ${m.energy_bonus_threshold}) — x${Number(m.coefficient).toFixed(2)} = ${calcQty} ${itemName}`;

                const checkBtn = document.createElement("button");
                checkBtn.className = "check-btn";
                checkBtn.innerHTML = "✔";

                if (m.is_complete) {
                    rowWrapper.classList.add("status-complete");
                } else if (m.is_warned) {
                    rowWrapper.classList.add("status-warned");
                    checkBtn.innerHTML = "⚠";
                } else if (m.faction_position === "Socius") {
                    // Visiting member — their chain hits still earn them a rank here,
                    // but they aren't an actual faction member, so skip distribution.
                    rowWrapper.classList.add("status-visitor");
                    checkBtn.innerHTML = "👁";
                }

                btn.onclick = () => {
                    if (calcQty <= 0) { setStatus("Rank qty is 0", true); return; }
                    const task = { name: name, id: userId, qty: calcQty, itemId: settings.item_id, expiry: Date.now() + 60000 };
                    sessionStorage.setItem("pending_xanax_task", JSON.stringify(task));
                    window.location.href = `https://www.torn.com/factions.php?step=your&type=1#/tab=armoury&start=0&sub=${settings.armory_tab}`;
                };

                checkBtn.onclick = async () => {
                    if (confirm(`Mark ${name} [${userId}] as complete?`)) {
                        const originalIcon = checkBtn.innerHTML;
                        checkBtn.innerHTML = "⏳";
                        const markRes = await apiRequest("POST", "/api/leadership/xanax", {
                            torn_user_id: userId, username: name, quantity: calcQty
                        }, jwt);
                        if (markRes.status === 200) {
                            rowWrapper.classList.add("status-complete");
                            setStatus("Marked complete ✔");
                        } else {
                            setStatus("Failed to mark complete", true);
                        }
                        checkBtn.innerHTML = originalIcon;
                    }
                };

                rowWrapper.appendChild(btn);
                rowWrapper.appendChild(checkBtn);
                factionBody.appendChild(rowWrapper);
                totalFound++;
            });
        });

        listContainer.appendChild(factionHeader);
        listContainer.appendChild(factionBody);
    });

    if (totalFound === 0) {
        listContainer.innerHTML = "<p style='text-align:center; padding:10px;'>No matching members found.</p>";
    }

    hideAllPages();
    document.getElementById("occ-xanax-page").style.display = "block";
    document.getElementById("occ-title").textContent = "Select Member";
    setStatus("Ready");
    }

    async function fetchAndShowWarnings() {
    const jwt = SafeStore.get(JWT_STORAGE);
    if (!jwt) {
        setStatus("Not authenticated — reopen panel", true);
        return;
    }

    const warnBtn = document.getElementById("occ-warnings-btn");
    const originalContent = warnBtn.innerHTML;

    warnBtn.disabled = true;
    warnBtn.textContent = "⏳ Loading...";
    setStatus("Fetching Warnings...");

    const res = await apiRequest("GET", "/api/leadership/warnings", null, jwt);

    warnBtn.disabled = false;
    warnBtn.innerHTML = originalContent;

    if (res.status !== 200 || !res.data?.warnings) {
        setStatus("Fetch Error: " + res.status, true);
        return;
    }

    // Tally chain/energy/total counts per member from the raw warning rows
    // (view-only — adding/editing warnings is handled on the website).
    const tallies = {};
    res.data.warnings.forEach(w => {
        if (!tallies[w.torn_user_id]) {
            tallies[w.torn_user_id] = { name: w.username, chain: 0, energy: 0, total: 0 };
        }
        const t = tallies[w.torn_user_id];
        t.total++;
        if (w.warning_type === "Chain") t.chain++;
        else if (w.warning_type === "Energy") t.energy++;
    });

    const listContainer = document.getElementById("occ-warn-list");
    listContainer.innerHTML = "";
    let totalFound = 0;

    Object.values(tallies).forEach(t => {
        const item = document.createElement("div");
        item.className = "warn-item";
        item.innerHTML = `
            <div class="warn-name">${t.name}</div>
            <div class="warn-line">Chain Warnings: <span class="warn-val">${t.chain}</span></div>
            <div class="warn-line">Energy Warnings: <span class="warn-val">${t.energy}</span></div>
            <div class="warn-line">Total Warnings: <span class="warn-val">${t.total}</span></div>
        `;
        listContainer.appendChild(item);
        totalFound++;
    });

    if (totalFound === 0) {
        listContainer.innerHTML = "<p style='text-align:center; padding:10px;'>No active warnings found.</p>";
    }

    hideAllPages();
    document.getElementById("occ-warnings-page").style.display = "block";
    document.getElementById("occ-title").textContent = "Warnings";
    setStatus("Ready");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Watcher Xanax — 1 Xanax per watched Chain Watch hour, same armoury
    // auto-fill flow as Monthly Xanax (see autoFillXanax below), just a
    // different source list and a flat (no rank) quantity. Scoped to a date
    // range rather than always showing every unpaid hour ever watched.
    // ─────────────────────────────────────────────────────────────────────
    // "YYYY-MM-DD" in LOCAL time, the format <input type="date"> expects.
    function toDateInputValue(date) {
        const pad = n => String(n).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    // For "custom", reads the two date pickers directly — "to" runs through
    // the END of that calendar day (midnight of the day after), so picking
    // the same day for both From and To still covers that whole day.
    function computeWatcherRange(preset) {
        const now = new Date();
        const to = Math.floor(now.getTime() / 1000);

        if (preset === "custom") {
            const fromVal = document.getElementById("occ-watcher-from").value;
            const toVal = document.getElementById("occ-watcher-to").value;
            const from = fromVal ? Math.floor(new Date(`${fromVal}T00:00:00`).getTime() / 1000) : 0;
            let customTo = to;
            if (toVal) {
                const toDate = new Date(`${toVal}T00:00:00`);
                toDate.setDate(toDate.getDate() + 1);
                customTo = Math.floor(toDate.getTime() / 1000);
            }
            return { from, to: customTo };
        }

        let from = 0;
        if (preset === "month") {
            from = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
        } else if (preset === "7d") {
            from = to - 7 * 86400;
        } else if (preset === "30d") {
            from = to - 30 * 86400;
        }
        return { from, to };
    }

    // Auto-suggests the Custom From/To by asking the backend for the watch
    // episode (contiguous watched hours, split wherever 3+ days go with none)
    // closest to now for this faction — falls back to "this month" if there's
    // no data to detect from. The dates stay fully editable afterwards.
    async function applyDetectedWatcherTimeframe(factionValue) {
        const fromInput = document.getElementById("occ-watcher-from");
        const toInput = document.getElementById("occ-watcher-to");
        const jwt = SafeStore.get(JWT_STORAGE);
        let applied = false;

        if (jwt) {
            const q = factionValue && factionValue !== "all" ? `?faction_id=${factionValue}` : "";
            const res = await apiRequest("GET", `/api/leadership/watcher-xanax/timeframe${q}`, null, jwt);
            if (res.status === 200 && res.data?.from != null && res.data?.to != null) {
                fromInput.value = toDateInputValue(new Date(res.data.from * 1000));
                toInput.value = toDateInputValue(new Date((res.data.to - 1) * 1000));
                applied = true;
            }
        }

        if (!applied) {
            const now = new Date();
            fromInput.value = toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
            toInput.value = toDateInputValue(now);
        }
    }

    // Selecting "Custom Dates…" reveals the pickers and auto-detects a
    // suggested range — presets fetch immediately since they need no
    // further input.
    async function handleWatcherRangeChange(e) {
        const customRow = document.getElementById("occ-watcher-custom-range");
        if (e.target.value === "custom") {
            customRow.style.display = "block";
            const factionSelect = document.getElementById("occ-watcher-faction");
            await applyDetectedWatcherTimeframe(factionSelect ? factionSelect.value : "all");
            return;
        }
        customRow.style.display = "none";
        fetchAndShowWatcherXanax();
    }

    // Changing faction while Custom is active re-detects the timeframe for
    // the newly selected faction (the previous one no longer applies).
    async function handleWatcherFactionChange(e) {
        const rangeSelect = document.getElementById("occ-watcher-range");
        if (rangeSelect && rangeSelect.value === "custom") {
            await applyDetectedWatcherTimeframe(e.target.value);
        }
        fetchAndShowWatcherXanax();
    }

    async function fetchAndShowWatcherXanax() {
    const globalCooldown = sessionStorage.getItem("occ_global_cooldown");
    if (globalCooldown && Date.now() < parseInt(globalCooldown)) {
        setStatus("System Cooling Down...", true);
        return;
    }

    const jwt = SafeStore.get(JWT_STORAGE);
    if (!jwt) {
        setStatus("Not authenticated — reopen panel", true);
        return;
    }

    const rangeSelect = document.getElementById("occ-watcher-range");
    const preset = rangeSelect ? rangeSelect.value : "month";
    if (preset === "custom" && (!document.getElementById("occ-watcher-from").value || !document.getElementById("occ-watcher-to").value)) {
        setStatus("Pick both a From and To date", true);
        return;
    }

    const watBtn = document.getElementById("occ-watcher-xanax");
    const originalContent = watBtn.innerHTML;

    watBtn.disabled = true;
    watBtn.textContent = "⏳ Loading...";
    setStatus("Fetching watcher hours...");

    currentWatcherRange = computeWatcherRange(preset);

    const factionSelect = document.getElementById("occ-watcher-faction");
    const factionFilter = factionSelect && factionSelect.value !== "all" ? `&faction_id=${factionSelect.value}` : "";

    const res = await apiRequest("GET", `/api/leadership/watcher-xanax?from=${currentWatcherRange.from}&to=${currentWatcherRange.to}${factionFilter}`, null, jwt);

    watBtn.disabled = false;
    watBtn.innerHTML = originalContent;

    if (res.status === 429) {
        sessionStorage.setItem("occ_global_cooldown", Date.now() + (5 * 60 * 1000));
        setStatus("Rate Limited - 5m Cooldown", true);
        return;
    }
    if (res.status !== 200 || !res.data?.members) {
        setStatus("Fetch Error: " + res.status, true);
        return;
    }

    const pendingContainer = document.getElementById("occ-watcher-pending");
    const pending = res.data.pendingReview || [];
    if (pending.length) {
        pendingContainer.innerHTML = `<div style="font-weight:bold; font-size:calc(var(--occ-font-base) - 1px); color:#fbbf24; margin-top:6px;">⚠ Needs Review (${pending.length})</div>` +
            pending.map(p => `
                <div class="occ-pending-row">
                    <div class="occ-pending-info">${p.username} — ${new Date(p.slot_start * 1000).toLocaleString()}<br><span class="occ-pending-note">"${p.note}"</span></div>
                    <div class="occ-pending-actions">
                        <button type="button" class="occ-pending-btn occ-pending-include" data-shift-id="${p.shift_id}" data-decision="included">✔ Include</button>
                        <button type="button" class="occ-pending-btn occ-pending-exclude" data-shift-id="${p.shift_id}" data-decision="excluded">✖ Exclude</button>
                    </div>
                </div>
            `).join("");
    } else {
        pendingContainer.innerHTML = "";
    }

    const listContainer = document.getElementById("occ-watcher-list");
    listContainer.innerHTML = "";

    const settings = { ...DEFAULT_ITEM, ...(res.data.settings || {}) };
    const itemName = settings.item_name;

    const factionMap = {};
    res.data.members.forEach(m => {
        if (!factionMap[m.faction_id]) factionMap[m.faction_id] = [];
        factionMap[m.faction_id].push(m);
    });

    let totalFound = 0;

    FACTION_ORDER.forEach(factionId => {
        const members = factionMap[factionId];
        if (!members || !members.length) return;

        const factionLabel = FACTION_LABELS[factionId] || factionId;

        const factionHeader = document.createElement("div");
        factionHeader.className = "occ-faction-header";
        factionHeader.innerHTML = `
            <span>${factionLabel} <span style="color:#888; font-weight:normal;">(${members.length})</span></span>
            <span class="faction-arrow">▶</span>
        `;

        const factionBody = document.createElement("div");
        factionBody.className = "occ-faction-body";

        factionHeader.addEventListener("click", () => {
            factionHeader.classList.toggle("open");
            factionBody.classList.toggle("open");
        });

        members.sort((a, b) => b.quantity - a.quantity).forEach(m => {
            const userId = m.torn_user_id;
            const name = m.username;
            const calcQty = m.quantity;

            const rowWrapper = document.createElement("div");
            rowWrapper.className = "member-row";

            const btn = document.createElement("button");
            btn.className = "member-btn";
            btn.textContent = `${name} — ${calcQty}h → ${calcQty} ${itemName}`;

            const checkBtn = document.createElement("button");
            checkBtn.className = "check-btn";
            checkBtn.innerHTML = "✔";

            btn.onclick = () => {
                if (calcQty <= 0) { setStatus("Nothing owed", true); return; }
                const task = { name: name, id: userId, qty: calcQty, itemId: settings.item_id, expiry: Date.now() + 60000 };
                sessionStorage.setItem("pending_xanax_task", JSON.stringify(task));
                window.location.href = `https://www.torn.com/factions.php?step=your&type=1#/tab=armoury&start=0&sub=${settings.armory_tab}`;
            };

            checkBtn.onclick = async () => {
                if (confirm(`Mark ${name} [${userId}] watcher xanax (${calcQty}) as paid?`)) {
                    const originalIcon = checkBtn.innerHTML;
                    checkBtn.innerHTML = "⏳";
                    const markRes = await apiRequest("POST", "/api/leadership/watcher-xanax", {
                        torn_user_id: userId, username: name, quantity: calcQty,
                        from: currentWatcherRange?.from, to: currentWatcherRange?.to
                    }, jwt);
                    if (markRes.status === 200) {
                        rowWrapper.classList.add("status-complete");
                        setStatus("Marked complete ✔");
                    } else {
                        setStatus("Failed to mark complete", true);
                    }
                    checkBtn.innerHTML = originalIcon;
                }
            };

            rowWrapper.appendChild(btn);
            rowWrapper.appendChild(checkBtn);
            factionBody.appendChild(rowWrapper);
            totalFound++;
        });

        listContainer.appendChild(factionHeader);
        listContainer.appendChild(factionBody);
    });

    if (totalFound === 0) {
        listContainer.innerHTML = "<p style='text-align:center; padding:10px;'>No unpaid watch hours found.</p>";
    }

    hideAllPages();
    document.getElementById("occ-watcher-xanax-page").style.display = "block";
    document.getElementById("occ-title").textContent = "Watcher Xanax";
    setStatus("Ready");
    }

    async function reviewWatcherShift(shiftId, decision) {
        const jwt = SafeStore.get(JWT_STORAGE);
        if (!jwt) { setStatus("Not authenticated — reopen panel", true); return; }

        setStatus(decision === "included" ? "Including hour..." : "Excluding hour...");
        const res = await apiRequest("POST", "/api/leadership/watcher-xanax/review", { shift_id: shiftId, decision }, jwt);

        if (res.status !== 200) {
            setStatus("Failed to review hour", true);
            return;
        }
        setStatus(decision === "included" ? "Hour included ✔" : "Hour excluded ✔");
        await fetchAndShowWatcherXanax();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Chain Raffle — mirrors the website's raffle tab (same backend, same
    // DB), so a draw made on either side shows up on the other via Refresh.
    // The on-screen reel is a single simplified cosmetic animation rather
    // than a port of the website's four distinct animations, but the draw
    // itself hits the exact same endpoint, so odds and results are identical.
    // ─────────────────────────────────────────────────────────────────────
    async function fetchAndShowRaffle() {
    const jwt = SafeStore.get(JWT_STORAGE);
    if (!jwt) {
        setStatus("Not authenticated — reopen panel", true);
        return;
    }

    let factionId = parseInt(SafeStore.get(FACTION_ID_STORAGE), 10);
    if (!factionId) {
        // First run after this update — existing sessions won't have this
        // cached yet (it's only set on login/re-auth), so derive it now.
        const apiKey = SafeStore.get(API_KEY_STORAGE);
        factionId = apiKey ? await verifyFactionAccess(apiKey) : null;
    }
    if (!factionId) {
        setStatus("Unknown faction — reopen panel", true);
        return;
    }

    document.getElementById("occ-raffle-create-form").style.display = "none";

    const raffleBtn = document.getElementById("occ-chain-raffle");
    const originalContent = raffleBtn.innerHTML;
    raffleBtn.disabled = true;
    raffleBtn.textContent = "⏳ Loading...";
    setStatus("Fetching raffle...");

    await loadRaffleRound(factionId);

    raffleBtn.disabled = false;
    raffleBtn.innerHTML = originalContent;

    hideAllPages();
    document.getElementById("occ-raffle-page").style.display = "block";
    document.getElementById("occ-title").textContent = "Chain Raffle";
    setStatus("Ready");
    }

    async function loadRaffleRound(factionId) {
    currentRaffleFactionId = factionId;
    const jwt = SafeStore.get(JWT_STORAGE);
    const container = document.getElementById("occ-raffle-body");

    const res = await apiRequest("GET", `/api/chain-watcher/raffle/rounds?faction_id=${factionId}`, null, jwt);
    if (res.status !== 200 || !res.data?.rounds) {
        currentRaffleRoundId = null;
        container.innerHTML = "<p style='text-align:center; padding:10px;'>Failed to load raffle rounds.</p>";
        document.getElementById("occ-raffle-draw-btn").disabled = true;
        return;
    }

    const active = res.data.rounds.find(r => r.status !== "completed");
    if (!active) {
        currentRaffleRoundId = null;
        container.innerHTML = "<p style='text-align:center; padding:10px;'>No active raffle round.<br>Tap ➕ New Round to start one.</p>";
        document.getElementById("occ-raffle-draw-btn").disabled = true;
        return;
    }

    currentRaffleRoundId = active.id;
    await renderRaffleRound(active.id);
    }

    async function renderRaffleRound(roundId) {
    const jwt = SafeStore.get(JWT_STORAGE);
    const container = document.getElementById("occ-raffle-body");
    const drawBtn = document.getElementById("occ-raffle-draw-btn");

    const res = await apiRequest("GET", `/api/chain-watcher/raffle/rounds/${roundId}`, null, jwt);
    if (res.status !== 200 || !res.data?.round) {
        container.innerHTML = "<p style='text-align:center; padding:10px;'>Failed to load round details.</p>";
        drawBtn.disabled = true;
        return;
    }

    const { round, overview, winners, entries } = res.data;
    const pendingCount = (entries || []).filter(e => e.review_status === "pending").length;

    let html = `<div id="occ-raffle-info">Round #${round.id} — ${new Date(round.period_start * 1000).toLocaleDateString()} → ${new Date(round.period_end * 1000).toLocaleDateString()}<br>Status: ${round.status}</div>`;

    if (pendingCount > 0) {
        html += `<div style="color:#ff6b6b; text-align:center; font-size:calc(var(--occ-font-base) - 2px); margin-bottom:6px;">${pendingCount} entr${pendingCount === 1 ? "y" : "ies"} need review on the website</div>`;
    }

    html += `<div id="occ-raffle-reel">🎲 Ready</div>`;
    html += `<div style="margin-top:6px; font-weight:bold; font-size:calc(var(--occ-font-base) - 1px);">Tickets</div>`;

    if (overview && overview.length) {
        overview.forEach(o => {
            html += `<div class="occ-raffle-row"><span>${o.username}</span><span>${o.slots}</span></div>`;
        });
    } else {
        html += `<p style='text-align:center; padding:6px; color:#888;'>No tickets in the pool.</p>`;
    }

    if (winners && winners.length) {
        html += `<div style="margin-top:10px; font-weight:bold; font-size:calc(var(--occ-font-base) - 1px);">Winners</div>`;
        winners.forEach(w => {
            html += `<div class="occ-raffle-row">
                <span>#${w.draw_number} <span class="occ-raffle-winner">${w.username}</span></span>
                <span style="display:flex; align-items:center; gap:6px;">
                    ${w.removal_mode === "all_tickets" ? "<span>✔ out</span>" : ""}
                    <button type="button" class="occ-raffle-send-btn" data-user-id="${w.torn_user_id}" data-username="${w.username}" data-message="Chain Raffle Round #${round.id}, Draw #${w.draw_number} winner - enjoy your Donator Pack!">📦 Send</button>
                </span>
            </div>`;
        });
    }

    container.innerHTML = html;

    const names = (overview || []).map(o => o.username);
    drawBtn.disabled = round.status === "completed" || names.length === 0;
    drawBtn.dataset.names = JSON.stringify(names);
    }

    async function drawRaffleWinner() {
    if (!currentRaffleRoundId) return;

    const jwt = SafeStore.get(JWT_STORAGE);
    const drawBtn = document.getElementById("occ-raffle-draw-btn");
    const reel = document.getElementById("occ-raffle-reel");
    const names = JSON.parse(drawBtn.dataset.names || "[]");

    if (!names.length) { setStatus("No tickets in the pool", true); return; }

    drawBtn.disabled = true;
    if (reel) reel.classList.add("spinning");

    let spinTimer = null;
    let delay = 80;
    (function spinTick() {
        if (reel) reel.textContent = names[Math.floor(Math.random() * names.length)];
        delay = Math.min(delay * 1.08, 260);
        spinTimer = setTimeout(spinTick, delay);
    })();

    const resPromise = apiRequest("POST", `/api/chain-watcher/raffle/rounds/${currentRaffleRoundId}/draw`, {
        removal_mode: RAFFLE_REMOVAL_MODE, animation_style: "slot_machine"
    }, jwt);

    // Keeps the reel spinning for a minimum beat even if the response is instant.
    const [res] = await Promise.all([resPromise, new Promise(r => setTimeout(r, RAFFLE_SPIN_MIN_MS))]);

    clearTimeout(spinTimer);
    if (reel) reel.classList.remove("spinning");

    if (res.status !== 200 || !res.data?.winner) {
        if (reel) reel.textContent = res.data?.error || "No tickets left";
        setStatus("Draw failed", true);
        await renderRaffleRound(currentRaffleRoundId);
        return;
    }

    if (reel) reel.textContent = `🏆 ${res.data.winner.username}`;
    setStatus("Winner drawn ✔");

    // Let the winner's name linger on the reel before the round refresh
    // replaces it with the updated tickets/winners list.
    await new Promise(r => setTimeout(r, RAFFLE_WINNER_LINGER_MS));
    await renderRaffleRound(currentRaffleRoundId);
    }

    // Stashes a pending "send" task and jumps to the player's own Supply
    // Pack Items page — there's no faction-armoury equivalent for a Donator
    // Pack, so this gifts it from the sender's personal inventory instead
    // (same send-to-name mechanic, different page).
    function sendRaffleItem(userId, name, message) {
        const task = { name, id: userId, qty: 1, itemId: RAFFLE_ITEM_ID, message: message || "", expiry: Date.now() + 60000 };
        sessionStorage.setItem(RAFFLE_ITEM_TASK_STORAGE, JSON.stringify(task));
        window.location.href = RAFFLE_ITEM_URL;
    }

    // Auto-fill on the player's own item page — confirmed from the actual
    // Supply Pack tab markup. The item row uses data-item (not data-itemid
    // like the faction armoury); its Send control is button.option-send
    // inside a sibling li[data-action="send"]; clicking it toggles
    // display:block on that same row's own .action-wrap.send-act panel,
    // which holds a <form act="send"> with the recipient search
    // (input.user-id.ac-search[name="userID"]), two linked amount inputs
    // (input.amount.input-money — a visible text one and the actual hidden
    // "amount" one, both need setting), and a message field
    // (input.message[name="tag"]) that only becomes active once
    // a.action-message is clicked.
    async function autoFillRaffleItem() {
        if (isFilling) return;
        const taskData = sessionStorage.getItem(RAFFLE_ITEM_TASK_STORAGE);
        if (!taskData) return;

        const task = JSON.parse(taskData);
        if (Date.now() > task.expiry) {
            sessionStorage.removeItem(RAFFLE_ITEM_TASK_STORAGE);
            return;
        }

        const itemRow = document.querySelector(`li[data-item="${task.itemId}"]`);
        if (!itemRow) return;

        isFilling = true;

        try {
            let panel = itemRow.querySelector('.action-wrap.send-act');
            if (!panel || panel.style.display !== 'block') {
                const sendBtn = itemRow.querySelector('li[data-action="send"] button.option-send');
                if (!sendBtn) return;
                sendBtn.click();
                await new Promise(r => setTimeout(r, 500));
                panel = itemRow.querySelector('.action-wrap.send-act');
            }
            if (!panel) {
                setStatus(`Couldn't open Send — do it manually for ${task.name}`, true);
                return;
            }

            const nameInput = panel.querySelector('input.user-id[name="userID"]');
            if (nameInput) {
                nameInput.value = task.id ? `${task.name} [${task.id}]` : task.name;
                nameInput.focus();
                nameInput.dispatchEvent(new Event('input', { bubbles: true }));
                setTimeout(() => {
                    nameInput.dispatchEvent(new Event('keydown', { bubbles: true }));
                }, 100);
            }

            panel.querySelectorAll('input.amount.input-money').forEach(inp => {
                inp.value = task.qty;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
            });

            if (task.message) {
                if (!panel.classList.contains('msg-active')) {
                    const addMsgLink = panel.querySelector('a.action-message');
                    if (addMsgLink) addMsgLink.click();
                }
                const msgInput = panel.querySelector('input.message[name="tag"]');
                if (msgInput) {
                    msgInput.value = task.message;
                    msgInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }

            if (nameInput) {
                sessionStorage.removeItem(RAFFLE_ITEM_TASK_STORAGE);
                setStatus(`Pre-filled ${RAFFLE_ITEM_NAME} for ${task.name}`);
            } else {
                // Dialog opened but its recipient field wasn't recognized —
                // leave the task in place so this doesn't silently drop it,
                // and let the leader finish the send by hand this once.
                setStatus(`Opened Send — enter ${task.name} manually`, true);
            }
        } catch (e) {
            console.error("Raffle item Auto-fill failed", e);
        } finally {
            isFilling = false;
        }
    }

    // Formats a Date as "YYYY-MM-DDTHH:mm" in LOCAL time, the format
    // <input type="datetime-local"> expects — and round-trips correctly
    // since `new Date(thatString)` also parses it as local time.
    function toDatetimeLocal(date) {
        const pad = n => String(n).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    // Defaults the new-round form to the last 24 hours — leadership adjusts
    // from there to match whatever chain/window they're actually running
    // the raffle for.
    function openRaffleCreateForm() {
        const now = new Date();
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        document.getElementById("occ-raffle-start").value = toDatetimeLocal(dayAgo);
        document.getElementById("occ-raffle-end").value = toDatetimeLocal(now);
        document.getElementById("occ-raffle-drawcount").value = 1;
        document.getElementById("occ-raffle-drawcount-val").textContent = "1";
        document.getElementById("occ-raffle-create-form").style.display = "block";
    }

    async function createRaffleRound() {
        const jwt = SafeStore.get(JWT_STORAGE);
        const factionId = currentRaffleFactionId;
        if (!factionId) { setStatus("Unknown faction", true); return; }

        const startInput = document.getElementById("occ-raffle-start").value;
        const endInput = document.getElementById("occ-raffle-end").value;
        if (!startInput || !endInput) { setStatus("Pick a start and end date/time", true); return; }

        const periodStart = Math.floor(new Date(startInput).getTime() / 1000);
        const periodEnd = Math.floor(new Date(endInput).getTime() / 1000);
        if (!(periodEnd > periodStart)) { setStatus("End must be after start", true); return; }

        const drawCount = parseInt(document.getElementById("occ-raffle-drawcount").value, 10) || 1;

        const confirmBtn = document.getElementById("occ-raffle-create-confirm");
        confirmBtn.disabled = true;
        setStatus("Creating round...");

        const res = await apiRequest("POST", "/api/chain-watcher/raffle/rounds", {
            faction_id: factionId, period_start: periodStart, period_end: periodEnd, draw_count: drawCount
        }, jwt);

        confirmBtn.disabled = false;

        if (res.status !== 200 || !res.data?.round) {
            setStatus("Failed to create round", true);
            return;
        }

        document.getElementById("occ-raffle-create-form").style.display = "none";
        currentRaffleRoundId = res.data.round.id;
        setStatus(`Round created — ${res.data.entriesPulled || 0} ticket(s) pulled ✔`);
        await renderRaffleRound(currentRaffleRoundId);
    }

    /**********************************************************
     * API & HELPERS
     **********************************************************/

    async function manualUpdateKey() {
        const newKey = prompt("Enter NEW Limited Access API key (Leave blank to cancel)");

        if (!newKey || newKey.trim() === "") {
            setStatus("Update cancelled");
            return;
        }

        setStatus("Validating new key...");
        const data = await gmFetch("https://api.torn.com/v2/key?selections=info&comment=Occultus", newKey);

        if (!data?.info) {
            alert("Invalid key. Current key preserved.");
            setStatus("Invalid key provided", true);
            return;
        }


        SafeStore.set(API_KEY_STORAGE, newKey);
        await fetchOperatingUser(newKey);
        await loginToBackend(newKey);
        setStatus("API Key Updated");
        await checkCouncilStatus();
    }

    async function checkCouncilStatus() {
        const key = SafeStore.get(API_KEY_STORAGE);
        if (!key) return;

        let cached = JSON.parse(SafeStore.get(FACTION_STORAGE));
        const now = Date.now();
        const oneWeek = 7 * 24 * 60 * 60 * 1000;

        let position = "";
        if (cached && (now - cached.timestamp < oneWeek)) {
            position = cached.position;
        } else {
            const data = await gmFetch("https://api.torn.com/v2/user/faction?comment=Occultus", key);
            if (data?.faction?.position) {
                position = data.faction.position;
                SafeStore.set(FACTION_STORAGE, JSON.stringify({ position, timestamp: now }));
            }
        }
        const isCouncil = COUNCIL_ROLES.includes(position.toLowerCase());
        document.getElementById("occ-council-btn").style.display = isCouncil ? "block" : "none";
    }

    async function gmFetch(url, key) {
    const cooldown = sessionStorage.getItem("occ_global_cooldown");
    if (cooldown && Date.now() < parseInt(cooldown)) {
        console.warn("Occultus: System in cooldown mode. Request skipped.");
        return null;
    }

    return new Promise(resolve => {
        GM_xmlhttpRequest({
            method: "GET",
            url,
            headers: { Authorization: "ApiKey " + key },
            timeout: 10000,
            onload: res => {
                if (res.status === 429) {
                    sessionStorage.setItem("occ_global_cooldown", Date.now() + (5 * 60 * 1000));
                    setStatus("Rate Limited - 5m Cooldown", true);
                    resolve(null);
                } else {
                    try {
                        resolve(JSON.parse(res.responseText));
                    } catch(e) {
                        console.error("Occultus: Failed to parse JSON", e);
                        resolve(null);
                    }
                }
            },
            onerror: () => resolve(null),
            ontimeout: () => {
                console.warn("Occultus: Request timed out.");
                resolve(null);
            }
        });
    });
    }

    async function togglePanel() {
        const panel = document.getElementById("occ-panel");
        const sidebar = panelPrefs.dockMode === "sidebar";
        const isOpen = sidebar ? panel.classList.contains("occ-sidebar-open") : panel.style.display === "block";
        if (isOpen) {
            closePanel();
            return;
        }
        setStatus("Ready");
        applyPanelPrefs();
        showMainPage();
        panel.style.display = "block";
        if (sidebar) {
            panel.classList.add("occ-sidebar-open");
            SafeStore.set(PANEL_OPEN_STORAGE, "1");
        }
        await checkCouncilStatus();
    }

    // In Sidebar Mode, open/closed state is remembered across page loads
    // (see reopenSidebarIfAuthenticated in init) — modal mode is unaffected,
    // it always starts closed as before.
    function closePanel() {
        const panel = document.getElementById("occ-panel");
        if (panelPrefs.dockMode === "sidebar") {
            panel.classList.remove("occ-sidebar-open");
            SafeStore.set(PANEL_OPEN_STORAGE, "0");
        } else {
            panel.style.display = "none";
        }
    }

    function setStatus(text, error = false) {
        const el = document.getElementById("occ-status");
        if (el) {
            el.textContent = text;
            el.style.color = error ? "#ff6b6b" : "#00ff9c";
        }
    }

    async function verifyFactionAccess(key) {
    if (!key) return null;

    try {
        const data = await gmFetch("https://api.torn.com/v2/key?selections=info&comment=Occultus", key);
        const factionId = data?.info?.user?.faction_id;

        if (!factionId || !ALLOWED_FACTION_IDS.includes(factionId)) {
            console.error("Access Denied: Faction ID", factionId);
            SafeStore.remove(API_KEY_STORAGE);
            SafeStore.remove(USER_STORAGE);
            SafeStore.remove(LAST_AUTH_STORAGE);
            SafeStore.remove(JWT_STORAGE);
            SafeStore.remove(FACTION_ID_STORAGE);
            //const launcher = document.getElementById("occ-launcher");
            //if (launcher) launcher.style.display = "none";
            const panel = document.getElementById("occ-panel");
            if (panel) panel.style.display = "none";

            alert("This script is restricted to authorized factions only.");
            return null;
        }

        SafeStore.set(LAST_AUTH_STORAGE, Date.now());
        SafeStore.set(FACTION_ID_STORAGE, String(factionId));
        return factionId;
    } catch (e) {
        console.error("Auth check failed", e);
        return null;
    }
    }

    async function validateAndSaveKey() {
    let key = SafeStore.get(API_KEY_STORAGE);

    const lastAuth = SafeStore.get(LAST_AUTH_STORAGE) || 0;
    const needsCheck = (Date.now() - lastAuth) > AUTH_CHECK_INTERVAL;

    if (!key) {
        key = prompt("Enter Limited Access API key");
        if (!key) return null;

        const factionId = await verifyFactionAccess(key);
        if (!factionId) return null;

        SafeStore.set(API_KEY_STORAGE, key);
        await fetchOperatingUser(key);
        await loginToBackend(key);
    } else if (needsCheck) {
        const factionId = await verifyFactionAccess(key);
        if (!factionId) return null;

        await loginToBackend(key);
    } else if (!SafeStore.get(JWT_STORAGE)) {
        // Have a valid key but no backend session yet (e.g. first run after update)
        await loginToBackend(key);
    }

    return key;
    }

    async function fetchOperatingUser(key) {
        const data = await gmFetch("https://api.torn.com/v2/user/basic?comment=Occultus", key);
        if (!data?.profile) return null;
        const user = { id: data.profile.id, name: data.profile.name };
        SafeStore.set(USER_STORAGE, JSON.stringify(user));
        return user;
    }

    async function getFactionMoney(key) {
        const data = await gmFetch("https://api.torn.com/v2/user/money?comment=Occultus", key);
        return data?.money?.faction?.money || 0;
    }

    function parseAmount(input) {
        input = input.toUpperCase().replace(/\s/g, '');
        let num = parseFloat(input);
        if (isNaN(num)) return null;
        if (input.endsWith("K")) num *= 1e3;
        if (input.endsWith("M")) num *= 1e6;
        if (input.endsWith("B")) num *= 1e9;
        return { short: input, full: Math.round(num) };
    }

    function sendEmbed(webhook, embed) {
        GM_xmlhttpRequest({
            method: "POST",
            url: webhook,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ username: "Occultus", embeds: [embed] }),
            onload: () => setStatus("Message Sent ✔"),
            onerror: () => setStatus("Failed to send", true)
        });
    }

    function sendToBot(endpoint, payload) {
        if (botBusy) return;
        botBusy = true;

        GM_xmlhttpRequest({
            method: "POST",
            url: `${BOT_URL}${endpoint}`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(payload),
            timeout: 5000,
            onload: (res) => {
                if (res.status === 429) {
                    sessionStorage.setItem("occ_global_cooldown", Date.now() + (2 * 60 * 1000));
                    setStatus("Bot Busy - Cooling down", true);
                } else {
                    setStatus("Bot Notified ✔");
                }
                setTimeout(() => { botBusy = false; }, 2000);
            },
            onerror: () => {
                setStatus("Bot Offline", true);
                setTimeout(() => { botBusy = false; }, 5000);
            },
            ontimeout: () => {
                setStatus("Bot Timeout", true);
                botBusy = false;
            }
        });
    }

    async function assistAttack() {
        if (!location.href.includes("sid=attack")) {
            setStatus("Not in attack", true);
            return;
        }

        const user = JSON.parse(SafeStore.get(USER_STORAGE));
        if (!user) return;

        let targetName = "a target";
        const defenderNameSpan = document.querySelector('.rose___QcHAq .userName___loAWK');
        if (defenderNameSpan) {
            targetName = defenderNameSpan.textContent.trim();
        } else {
            targetName = document.title.split(' | ')[0];
        }
        if (targetName === user.name || !targetName) {
            setStatus("Waiting for target...", true);
            return;
        }

        sendToBot('/torn-attack', {
            userName: user.name,
            userId: user.id,
            targetName: targetName,
            attackLink: location.href
        });
    }

    async function withdrawFunds() {
        const user = JSON.parse(SafeStore.get(USER_STORAGE));
        const key = SafeStore.get(API_KEY_STORAGE);
        if (!user || !key) return;

        const factionId = await verifyFactionAccess(key);
        if (!factionId) return;

        const input = prompt("Enter amount (50k / 200m / 1B)");
        if (!input) return;
        const amount = parseAmount(input);
        if (!amount) { setStatus("Invalid amount", true); return; }

        const factionMoney = await getFactionMoney(key);
        if (amount.full > factionMoney) { setStatus("Insufficient funds", true); return; }

        sendToBot('/torn-withdraw', {
            userName: user.name,
            userId: user.id,
            factionId: factionId,
            amount: amount.full,
            processLink: `https://www.torn.com/factions.php?step=your#/tab=controls&giveMoneyTo=${user.id}&money=${amount.full}`
        });
    }

    function createLauncher() {
    const settingsButton = document.getElementById("notes_settings_button");
    if (!settingsButton || document.getElementById("occ-launcher")) return;

    const launcher = document.createElement("button");
    launcher.id = "occ-launcher";
    launcher.type = "button";
    launcher.className = "root___WHFbh root___J_YsG root___wAw5_";
    launcher.title = "Occultus Operations";

    const img = document.createElement("img");
    img.src = ICON_IMAGE;

    launcher.appendChild(img);

    launcher.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const key = await validateAndSaveKey();
        if (key) togglePanel();
    };

    settingsButton.parentNode.insertBefore(launcher, settingsButton.nextSibling);
    }

    async function autoFillXanax() {
        if (isFilling) return;
        const taskData = sessionStorage.getItem("pending_xanax_task");
        if (!taskData || isFilling) return;

        const task = JSON.parse(taskData);
        if (Date.now() > task.expiry) {
            sessionStorage.removeItem("pending_xanax_task");
            return;
        }

        const itemId = task.itemId || DEFAULT_ITEM.item_id;
        const xanaxRow = document.querySelector(`li [data-itemid="${itemId}"]`)?.closest('li');
        if (!xanaxRow || !xanaxRow.querySelector('a[data-role="give"]')) return;

        isFilling = true;

        try {
            if (!xanaxRow.classList.contains('item-give-act')) {
                const giveBtn = xanaxRow.querySelector('a[data-role="give"]');
                if (giveBtn) giveBtn.click();
                await new Promise(r => setTimeout(r, 500));
            }

            const qtyInput = xanaxRow.querySelector('.give-cont .quantity[type="text"]');
            if (qtyInput) {
                qtyInput.value = task.qty;
                qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
            }

            const nameInput = xanaxRow.querySelector('.give-cont .ac-search');
            if (nameInput) {
                nameInput.value = task.id ? `${task.name} [${task.id}]` : task.name;
                nameInput.focus();
                nameInput.dispatchEvent(new Event('input', { bubbles: true }));
                setTimeout(() => {
                    nameInput.dispatchEvent(new Event('keydown', { bubbles: true }));
                }, 100);
            }

            sessionStorage.removeItem("pending_xanax_task");
            setStatus(`Pre-filled ${task.qty}x for ${task.name}`);
        } catch (e) {
            console.error("Xanax Auto-fill failed", e);
        } finally {
            isFilling = false;
        }
    }

    /**********************************************************
     * INITIALIZATION & OBSERVERS
     **********************************************************/

    function debounce(func, timeout = 250) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => { func.apply(this, args); }, timeout);
        };
    }

    // Several of Torn's own pages are internally React/SPA-routed (hash-based
    // tab switches with no real navigation) — if that page's own re-render
    // happens to touch document.body's children, our appended panel/edge tab
    // can get silently removed without any navigation or reload happening at
    // all, and neither init() nor the reopen logic below would ever re-run to
    // notice. This re-creates them (and restores an open Sidebar) whenever
    // that's detected, independent of real page loads.
    function ensurePanelExists() {
        if (document.getElementById("occ-panel") && document.getElementById("occ-edge-tab")) return;
        console.warn("Occultus: panel/edge tab missing from DOM — recreating");
        createPanel();
        applyPanelPrefs();
        if (panelPrefs.dockMode === "sidebar" && SafeStore.get(PANEL_OPEN_STORAGE) === "1") {
            reopenSidebarIfAuthenticated();
        }
    }

    const runLightChecks = debounce(() => {
        ensurePanelExists();
        addFactionOperationsButton();
        addSettingsOperationsEntry();

        if (window.location.href.includes("tab=armoury") && sessionStorage.getItem("pending_xanax_task")) {
            autoFillXanax();
        }
        if (window.location.href.includes("item.php") && sessionStorage.getItem(RAFFLE_ITEM_TASK_STORAGE)) {
            autoFillRaffleItem();
        }
    }, 300);


    const observer = new MutationObserver(() => {
        const now = Date.now();
        if (now - lastCheck < 500) return;

        lastCheck = now;

        ensurePanelExists();
        addFactionOperationsButton();
        addSettingsOperationsEntry();

        if (window.location.href.includes("tab=armoury") && sessionStorage.getItem("pending_xanax_task")) {
            autoFillXanax();
        }
        if (window.location.href.includes("item.php") && sessionStorage.getItem(RAFFLE_ITEM_TASK_STORAGE)) {
            autoFillRaffleItem();
        }
    });


    async function reopenSidebarIfAuthenticated() {
        if (!SafeStore.get(API_KEY_STORAGE)) {
            console.warn("Occultus: Sidebar Mode was open, but no saved API key to silently re-auth with");
            return;
        }
        const key = await validateAndSaveKey();
        if (key) {
            console.log("Occultus: reopening sidebar panel");
            togglePanel();
        } else {
            console.warn("Occultus: Sidebar Mode re-open aborted — validateAndSaveKey() returned no key");
        }
    }

    function init() {
        // The real load (see the placeholder declaration above) — confirmed
        // more reliable here than at top-level script evaluation.
        panelPrefs = loadStoredPanelPrefs();
        createPanel();
        applyPanelPrefs();
        addFactionOperationsButton();
        addSettingsOperationsEntry();

        observer.observe(document.body, { childList: true, subtree: true });

        if (window.location.href.includes("tab=armoury") && sessionStorage.getItem("pending_xanax_task")) {
            autoFillXanax();
        }
        if (window.location.href.includes("item.php") && sessionStorage.getItem(RAFFLE_ITEM_TASK_STORAGE)) {
            autoFillRaffleItem();
        }

        // Sidebar Mode persists its open/closed state across page loads —
        // without this, every navigation/refresh would silently re-close it.
        if (panelPrefs.dockMode === "sidebar" && SafeStore.get(PANEL_OPEN_STORAGE) === "1") {
            reopenSidebarIfAuthenticated();
        }

        // Belt-and-suspenders against Torn's own page swapping out
        // document.body wholesale (some of its sections are React-routed) —
        // that would silently detach our MutationObserver (it watches a
        // specific node, not "whatever body currently is") without firing
        // any event we could react to. Re-pointing it at the CURRENT body
        // every tick, and independently re-checking/recreating our own
        // elements, catches that regardless of how it happened.
        setInterval(() => {
            observer.observe(document.body, { childList: true, subtree: true });
            ensurePanelExists();
        }, 2000);
    }


    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
