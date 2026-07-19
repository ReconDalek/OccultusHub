// ==UserScript==
// @name         Occultus Operations
// @namespace    Recon.Occultus.Operations
// @version      1.3.0
// @description  Occultus Faction Additions
// @author       Recon-
// @match        *://www.torn.com/*
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
    const FACTION_LABELS = { 33097: "Occ1", 9728: "Occ2", 9171: "Occ3" };
    const COUNCIL_ROLES = ["council", "archon", "leader", "co-leader"];
    const BASE_XANAX = 5;
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

    /**********************************************************
     * STYLES
     **********************************************************/

    const style = document.createElement("style");
    style.textContent = `
#occ-launcher { background: #005774 !important; border: none !important; cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 5px !important;  margin: 0 !important; height: auto !important; align-self: stretch !important; }
#occ-launcher img { width: 28px !important; height: 28px !important; display: block !important; transition: transform 1.5s linear; }
#occ-launcher:hover { background: #007ea0 !important; }
#occ-launcher:hover img { transform: rotate(360deg); }

#occ-panel { position: fixed; width: 260px; background: rgba(15,15,15,0.95); color: #fff; border-radius: 8px; padding: 10px; font-family: Arial; font-size: 13px; z-index: 10000000; box-shadow: 0 0 12px black; display: none; left: 50% !important; transform: translateX(-50%); }
#occ-header { position: relative; display: flex; justify-content: center; align-items: center; font-weight: bold; margin-bottom: 10px; padding: 0 20px; }
#occ-close { position: absolute; right: 0; top: -1; cursor: pointer; color: #ff6b6b; font-size: 16px; }

#occ-panel button { width: 100%; margin-top: 4px; padding: 8px; background: #5865F2; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity 0.2s; }
#occ-panel button.nav-btn { margin-top: 12px !important; }
#occ-panel button:hover { background: #4752c4; }
#occ-panel button.green-btn { background: #43b581; }
#occ-panel button.green-btn:hover { background: #3ca374; }
#occ-panel button.red-btn { background: #ff6b6b; }
#occ-panel button.red-btn:hover { background: #e55a5a; }
#occ-panel button:disabled { background: #444 !important; cursor: not-allowed; opacity: 0.7; }

#occ-status { margin-top: 8px; font-size: 11px; color: #00ff9c; text-align: center; }
#occ-settings { position: absolute; bottom: 6px; right: 9px; font-size: 18px; color: #bbb; cursor: pointer; user-select: none; }

#occ-member-list { max-height: 400px; overflow-y: auto; overflow-x: hidden !important; margin-top: 5px; padding-right: 0 10px }
#occ-member-list::-webkit-scrollbar { width: 4px; }
#occ-member-list::-webkit-scrollbar-thumb { background: #444; border-radius: 2px; }
#occ-member-list button { margin: 4px 0 0 5px !important; width: calc(100% - 5px) !important; font-size: 12px; padding: 6px; }
.occ-rank-header { background: #222; color: #00ff9c; padding: 6px 10px; margin-top: 10px; font-weight: bold; font-size: 10px; border-left: 3px solid #00ff9c; display: flex !important; justify-content: space-between !important; align-items: center !important; box-sizing: border-box; width: calc(100% - 5px); }
.occ-rank-info { color: #888; font-weight: normal; flex-shrink: 0; margin-left: auto; text-align: right; }

.member-row { display: flex; gap: 4px; align-items: stretch; margin-top: 4px; width: 100%; }
.member-btn { flex: 1 1 auto; margin: 0 !important; font-size: 12px; padding: 6px; text-align: center; }
.check-btn { flex: 0 0 30px; margin: 0 !important; background: #3ca374; cursor: pointer; font-size: 16px; padding: 6px; display: flex; align-items: center; justify-content: center; }
.status-complete .member-btn { opacity: 0.3 !important; cursor: not-allowed !important; pointer-events: none; }
.status-complete .check-btn { background: #222 !important; opacity: 0.5; pointer-events: none; }
.status-warned .member-btn { background: #8b2e2e !important; color: #ccc !important; cursor: not-allowed !important; pointer-events: none; opacity: 0.8; }
.status-warned .check-btn { background: #5a1a1a !important; pointer-events: none; }

#occ-xan-footer { padding: 10px; border-top: 1px solid #333; margin-top: 10px; }

#occ-warn-list { max-height: 400px; overflow-y: auto; overflow-x: hidden !important; margin-top: 5px; padding-right: 5px; }
.warn-item { background: #1a1a1a; border: 1px solid #333; padding: 8px; border-radius: 4px; margin-top: 6px; }
.warn-name { color: #ff6b6b; font-weight: bold; font-size: 13px; border-bottom: 1px solid #333; padding-bottom: 4px; margin-bottom: 4px; }
.warn-line { font-size: 11px; color: #bbb; display: flex; justify-content: space-between; }
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
    font-size: 11px;
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
.occ-faction-header .faction-arrow { transition: transform 0.2s; font-size: 10px; }
.occ-faction-header.open .faction-arrow { transform: rotate(90deg); }
.occ-faction-body { display: none; }
.occ-faction-body.open { display: block; }

`;
    document.head.appendChild(style);

    /**********************************************************
     * PANEL & UI
     **********************************************************/

    function createPanel() {
    if (document.getElementById("occ-panel")) return;

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
    <button id="occ-warnings-btn">⚠️ Warnings</button>
    <button id="occ-back-to-main" class="red-btn nav-btn">⬅ Back</button>
</div>

<div id="occ-xanax-page" style="display:none;">
    <div id="occ-member-list"></div>
    <button id="occ-xan-back" class="red-btn nav-btn">⬅ Back</button>
</div>

<div id="occ-warnings-page" style="display:none;">
    <div id="occ-warn-list"></div>
    <button id="occ-warn-back" class="red-btn nav-btn">⬅ Back</button>
</div>

<div id="occ-settings-page" style="display:none;">
    <button id="occ-update-api">Update API Key</button>
    <button id="occ-save-settings" class="green-btn nav-btn">Save</button>
</div>
`;
        document.body.appendChild(panel);

        document.getElementById("occ-close").onclick = closePanel;
        document.getElementById("occ-assist").onclick = assistAttack;
        document.getElementById("occ-withdraw").onclick = withdrawFunds;
        document.getElementById("occ-council-btn").onclick = openCouncil;
        document.getElementById("occ-back-to-main").onclick = showMainPage;
        document.getElementById("occ-settings").onclick = openSettings;
        document.getElementById("occ-save-settings").onclick = showMainPage;
        document.getElementById("occ-monthly-xanax").onclick = fetchAndShowMembers;
        document.getElementById("occ-xan-back").onclick = openCouncil;
        document.getElementById("occ-update-api").onclick = manualUpdateKey;
        document.getElementById("occ-warnings-btn").onclick = fetchAndShowWarnings;
        document.getElementById("occ-warn-back").onclick = openCouncil;
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
    }

    function hideAllPages() {
    ["occ-main-page", "occ-council-page", "occ-xanax-page", "occ-warnings-page", "occ-settings-page"].forEach(id => {
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

    // Render each faction as a collapsible section
    Object.keys(factionMap).sort().forEach(factionId => {
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
            const mod = RANK_MODIFIERS[rankKey] ?? 1.0;
            const calcQty = Math.floor(BASE_XANAX * mod);

            const header = document.createElement("div");
            header.className = "occ-rank-header";
            header.innerHTML = `<span>${targetRank}S</span><span class="occ-rank-info">x${mod.toFixed(1)} (${calcQty} Xanax)</span>`;
            factionBody.appendChild(header);

            membersInRank.forEach(m => {
                const userId = m.torn_user_id;
                const name = m.username;

                const rowWrapper = document.createElement("div");
                rowWrapper.className = "member-row";

                const btn = document.createElement("button");
                btn.className = "member-btn";
                btn.textContent = name;

                const checkBtn = document.createElement("button");
                checkBtn.className = "check-btn";
                checkBtn.innerHTML = "✔";

                if (m.is_complete) {
                    rowWrapper.classList.add("status-complete");
                } else if (m.is_warned) {
                    rowWrapper.classList.add("status-warned");
                    checkBtn.innerHTML = "⚠";
                }

                btn.onclick = () => {
                    if (calcQty <= 0) { setStatus("Rank qty is 0", true); return; }
                    const task = { name: name, qty: calcQty, expiry: Date.now() + 60000 };
                    sessionStorage.setItem("pending_xanax_task", JSON.stringify(task));
                    window.location.href = "https://www.torn.com/factions.php?step=your&type=1#/tab=armoury&start=0&sub=drugs";
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
        if (panel.style.display === "block") {
            panel.style.display = "none";
            return;
        }
        setStatus("Ready");
        panel.style.top = `60px`;
        showMainPage();
        panel.style.display = "block";
        await checkCouncilStatus();
    }

    function closePanel() { document.getElementById("occ-panel").style.display = "none"; }

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
            //const launcher = document.getElementById("occ-launcher");
            //if (launcher) launcher.style.display = "none";
            const panel = document.getElementById("occ-panel");
            if (panel) panel.style.display = "none";

            alert("This script is restricted to authorized factions only.");
            return null;
        }

        SafeStore.set(LAST_AUTH_STORAGE, Date.now());
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

        const xanaxRow = document.querySelector('li [data-itemid="206"]')?.closest('li');
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
                nameInput.value = task.name;
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

    const runLightChecks = debounce(() => {
        addFactionOperationsButton();
        addSettingsOperationsEntry();

        if (window.location.href.includes("sub=drugs") && sessionStorage.getItem("pending_xanax_task")) {
            autoFillXanax();
        }
    }, 300);


    const observer = new MutationObserver(() => {
        const now = Date.now();
        if (now - lastCheck < 500) return;

        lastCheck = now;

        addFactionOperationsButton();
        addSettingsOperationsEntry();

        if (window.location.href.includes("sub=drugs") && sessionStorage.getItem("pending_xanax_task")) {
            autoFillXanax();
        }
    });


    function init() {
        createPanel();
        addFactionOperationsButton();
        addSettingsOperationsEntry();

        observer.observe(document.body, { childList: true, subtree: true });

        if (window.location.href.includes("sub=drugs") && sessionStorage.getItem("pending_xanax_task")) {
            autoFillXanax();
        }
    }


    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
