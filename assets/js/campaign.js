/**
 * Véu RPG - Módulo da Campanha (assets/js/campaign.js)
 * Gerencia Visão do Mestre, Visão do Jogador, Fichas, Escudo do Mestre,
 * Iniciativa, Compendium, Duplicação e Configurações da Campanha.
 */

import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  arrayRemove,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { openCoverCropper } from "./cover-cropper.js";

// ==========================================================================
// 1. ESTADO DA CAMPANHA ATIVA
// ==========================================================================
let activeCampaign = null;
let currentAuthUser = null;
let isMasterUser = false;
let storedSwitchSection = null;

// Listeners unsubscribe handles
let unsubSheets = null;
let unsubNpcs = null;
let unsubCompendium = null;
let unsubCampaignDoc = null;

// Armazenamento em memória para iniciativa e compendium
let campaignSheetsCache = [];
let campaignNpcsCache = [];
let campaignCompendiumCache = [];
let initiativeList = [];
let currentTurnIndex = 0;

// ==========================================================================
// 2. ELEMENTOS DO DOM (CAMPANHA)
// ==========================================================================
const detailCoverImg = document.getElementById("detailCoverImg");
const detailTitle = document.getElementById("detailTitle");
const detailSystemBadge = document.getElementById("detailSystemBadge");
const detailRoleBadge = document.getElementById("detailRoleBadge");
const detailMasterInfo = document.getElementById("detailMasterInfo");
const detailInviteCode = document.getElementById("detailInviteCode");
const btnCopyInviteCode = document.getElementById("btnCopyInviteCode");

if (btnCopyInviteCode) {
  btnCopyInviteCode.addEventListener("click", () => {
    if (activeCampaign && activeCampaign.inviteCode) {
      navigator.clipboard.writeText(activeCampaign.inviteCode).then(() => {
        showToast(`Código "${activeCampaign.inviteCode}" copiado para a área de transferência!`, "success");
      }).catch(() => {
        showToast(`Código: ${activeCampaign.inviteCode}`, "info");
      });
    }
  });
}

// Abas da Campanha
const campTabButtons = document.querySelectorAll(".camp-tab-btn");
const campTabPanels = document.querySelectorAll(".camp-tab-panel");
const gmOnlyElements = document.querySelectorAll(".gm-only");

// Fichas
const sheetsGrid = document.getElementById("sheetsGrid");
const btnOpenCreateSheet = document.getElementById("btnOpenCreateSheet");
const modalCreateSheet = document.getElementById("modal-ficha") || document.getElementById("modalCreateSheet");
const formCreateSheet = document.getElementById("formCreateSheet");
const sheetAssignPlayerGroup = document.getElementById("sheetAssignPlayerGroup");
const sheetAssignPlayerSelect = document.getElementById("sheetAssignPlayerSelect");
const sheetAvatarUrlInput = document.getElementById("sheetAvatarUrl");
const sheetAvatarPreview = document.getElementById("sheetAvatarPreview");

if (sheetAvatarUrlInput && sheetAvatarPreview) {
  sheetAvatarUrlInput.addEventListener("input", () => {
    const url = sheetAvatarUrlInput.value.trim();
    if (url) {
      sheetAvatarPreview.innerHTML = `<img src="${escapeHtml(url)}" class="sheet-avatar-img" onerror="this.onerror=null; this.parentElement.textContent='🎭';">`;
    } else {
      sheetAvatarPreview.textContent = "🎭";
    }
  });
}

// Jogadores
const campPlayersList = document.getElementById("campPlayersList");

// Escudo do Mestre
const gmVitalsGrid = document.getElementById("gmVitalsGrid");
const npcsGrid = document.getElementById("npcsGrid");
const btnOpenCreateNPC = document.getElementById("btnOpenCreateNPC");
const formCreateNPC = document.getElementById("formCreateNPC");

// Iniciativa
const initiativeItemsList = document.getElementById("initiativeItemsList");
const btnRollAllInitiatives = document.getElementById("btnRollAllInitiatives");
const btnNextTurn = document.getElementById("btnNextTurn");
const btnPrevTurn = document.getElementById("btnPrevTurn");
const btnClearInitiative = document.getElementById("btnClearInitiative");
const btnAddCombatant = document.getElementById("btnAddCombatant");
const formAddCombatant = document.getElementById("formAddCombatant");
const currentTurnBadge = document.getElementById("currentTurnBadge");

// Compendium
const compendiumGrid = document.getElementById("compendiumGrid");
const compendiumSearch = document.getElementById("compendiumSearch");
const compendiumFilters = document.querySelectorAll(".filter-pill");
const btnOpenCreateCompendium = document.getElementById("btnOpenCreateCompendium");
const formCreateCompendium = document.getElementById("formCreateCompendium");
let currentCompendiumFilter = "todos";

// Configurações e Duplicação
const formCampaignSettings = document.getElementById("formCampaignSettings");
const campSettingsName = document.getElementById("campSettingsName");
const campSettingsCover = document.getElementById("campSettingsCover");
const btnUploadCampSettingsCover = document.getElementById("btnUploadCampSettingsCover");
const campSettingsCoverFileInput = document.getElementById("campSettingsCoverFileInput");
const campSettingsSystemA = document.getElementById("campSettingsSystemA");
const campSettingsSystemB = document.getElementById("campSettingsSystemB");
const btnOpenDuplicate = document.getElementById("btnOpenDuplicate");
const formDuplicateCampaign = document.getElementById("formDuplicateCampaign");
const duplicateCampaignName = document.getElementById("duplicateCampaignName");
const btnOpenDeleteCampaign = document.getElementById("btnOpenDeleteCampaign");
const formDeleteCampaign = document.getElementById("formDeleteCampaign");
const confirmCampaignNameInput = document.getElementById("confirmCampaignNameInput");

// ==========================================================================
// 3. INICIALIZAÇÃO DO WORKSPACE DA CAMPANHA
// ==========================================================================
export function initCampaignWorkspace(campaign, user, switchSectionCallback, showAlertCallback) {
  // Limpa ouvintes anteriores
  cleanupCampaignListeners();

  activeCampaign = campaign;
  currentAuthUser = user;
  isMasterUser = campaign.masterId === user.uid;
  storedSwitchSection = switchSectionCallback;

  // Atualiza banner superior da campanha
  if (detailCoverImg) detailCoverImg.src = campaign.coverUrl || "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1000&auto=format&fit=crop";
  if (detailTitle) detailTitle.textContent = campaign.name;
  if (detailSystemBadge) detailSystemBadge.textContent = campaign.system || "Escória de Deus RPG";

  if (detailRoleBadge) {
    detailRoleBadge.textContent = isMasterUser ? "Mestre" : "Jogador";
    detailRoleBadge.className = `badge-tag ${isMasterUser ? "badge-master" : "badge-player"}`;
  }

  if (detailMasterInfo) {
    detailMasterInfo.textContent = `Mestre da Mesa: ${campaign.masterName || "Mestre"} (${campaign.masterEmail || ""})`;
  }

  if (detailInviteCode) {
    detailInviteCode.textContent = campaign.inviteCode || "------";
  }

  // Controle de permissão de abas: mostra/oculta recursos exclusivos do Mestre
  gmOnlyElements.forEach((el) => {
    el.style.display = isMasterUser ? "" : "none";
  });

  // Ativa a primeira aba disponível (Fichas)
  switchCampTab("sheets");

  // Inicia escutas em tempo real das subcoleções
  listenCampaignDoc(campaign.id);
  listenSheets(campaign.id);
  listenPlayers();
  if (isMasterUser) {
    listenNpcs(campaign.id);
    listenCompendium(campaign.id);
  }
  populateCampaignSettings(campaign);

  // Alterna a tela para a visão de detalhes
  if (switchSectionCallback) {
    switchSectionCallback("campaign-detail");
  }
}

export function cleanupCampaignListeners() {
  if (unsubSheets) unsubSheets();
  if (unsubNpcs) unsubNpcs();
  if (unsubCompendium) unsubCompendium();
  if (unsubCampaignDoc) unsubCampaignDoc();

  campaignSheetsCache = [];
  campaignNpcsCache = [];
  campaignCompendiumCache = [];
  initiativeList = [];
  currentTurnIndex = 0;
}

// Escuta atualizações do documento pai da campanha em tempo real
function listenCampaignDoc(campaignId) {
  unsubCampaignDoc = onSnapshot(doc(db, "campaigns", campaignId), (docSnap) => {
    if (!docSnap.exists()) return;
    activeCampaign = { id: docSnap.id, ...docSnap.data() };
    if (detailTitle) detailTitle.textContent = activeCampaign.name;
    if (detailSystemBadge) detailSystemBadge.textContent = activeCampaign.system;
    if (detailCoverImg) detailCoverImg.src = activeCampaign.coverUrl;
    listenPlayers();
  });
}

// ==========================================================================
// 4. CONTROLE DE ABAS INTERNAS DA CAMPANHA E NAVEGAÇÃO LATERAL
// ==========================================================================
const campaignTabsScroll = document.getElementById("campaign-tabs-scroll");
const tabArrowLeft = document.getElementById("tab-arrow-left");
const tabArrowRight = document.getElementById("tab-arrow-right");

function updateTabArrowsVisibility() {
  if (!campaignTabsScroll) return;

  const scrollLeft = campaignTabsScroll.scrollLeft;
  const clientWidth = campaignTabsScroll.clientWidth;
  const scrollWidth = campaignTabsScroll.scrollWidth;

  const maxScroll = scrollWidth - clientWidth;
  const hasOverflow = maxScroll > 2;

  if (tabArrowLeft) {
    const isAtStart = scrollLeft <= 2;
    const hideLeft = !hasOverflow || isAtStart;
    tabArrowLeft.disabled = hideLeft;
    tabArrowLeft.classList.toggle("hidden", hideLeft);
  }

  if (tabArrowRight) {
    const isAtEnd = scrollLeft >= maxScroll - 2;
    const hideRight = !hasOverflow || isAtEnd;
    tabArrowRight.disabled = hideRight;
    tabArrowRight.classList.toggle("hidden", hideRight);
  }
}

if (tabArrowLeft && campaignTabsScroll) {
  tabArrowLeft.addEventListener("click", () => {
    campaignTabsScroll.scrollBy({ left: -180, behavior: "smooth" });
  });
}

if (tabArrowRight && campaignTabsScroll) {
  tabArrowRight.addEventListener("click", () => {
    campaignTabsScroll.scrollBy({ left: 180, behavior: "smooth" });
  });
}

if (campaignTabsScroll) {
  campaignTabsScroll.addEventListener("scroll", updateTabArrowsVisibility, { passive: true });
}

window.addEventListener("resize", updateTabArrowsVisibility);

function switchCampTab(tabId) {
  campTabButtons.forEach((btn) => {
    const isTarget = btn.getAttribute("data-camptab") === tabId;
    btn.classList.toggle("active", isTarget);
    if (isTarget && campaignTabsScroll) {
      btn.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    }
  });

  campTabPanels.forEach((panel) => {
    const isTarget = panel.id === `campTab-${tabId}`;
    panel.classList.toggle("active", isTarget);
  });

  setTimeout(updateTabArrowsVisibility, 60);
}

campTabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.getAttribute("data-camptab");
    if (target) switchCampTab(target);
  });
});

// ==========================================================================
// 5. ABA 1: FICHAS (SHEETS)
// ==========================================================================
function listenSheets(campaignId) {
  if (unsubSheets) {
    unsubSheets();
    unsubSheets = null;
  }

  const sheetsCol = collection(db, "campaigns", campaignId, "sheets");

  unsubSheets = onSnapshot(sheetsCol, (snapshot) => {
    campaignSheetsCache = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    // Ordenação segura em memória: fichas mais recentes primeiro
    campaignSheetsCache.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return timeB - timeA;
    });
    renderSheets();
    if (isMasterUser) {
      renderGmVitalsHud();
    }
  }, (err) => {
    console.warn("Aviso ao escutar fichas:", err);
  });
}

function getSheetAssignedList(sheet) {
  if (Array.isArray(sheet.assignedPlayers) && sheet.assignedPlayers.length > 0) {
    return sheet.assignedPlayers;
  }
  if (sheet.ownerId) {
    return [{ uid: sheet.ownerId, name: sheet.ownerName || "Jogador" }];
  }
  return [];
}

function isUserAssignedToSheet(sheet, uid) {
  if (!uid) return false;
  if (sheet.ownerId === uid) return true;
  if (Array.isArray(sheet.assignedUids) && sheet.assignedUids.includes(uid)) return true;
  if (Array.isArray(sheet.assignedPlayers) && sheet.assignedPlayers.some((p) => p.uid === uid)) return true;
  return false;
}

function getSheetOwnersDisplayText(sheet) {
  const list = getSheetAssignedList(sheet);
  if (list.length === 0) return "Não atribuída";
  return list.map((p) => p.name).join(", ");
}

function renderSheets() {
  if (!sheetsGrid) return;
  sheetsGrid.innerHTML = "";

  // Permissões: Mestre (GM) visualiza todas as fichas da campanha; Jogadores visualizam as fichas atribuídas a eles.
  const visibleSheets = isMasterUser
    ? campaignSheetsCache
    : campaignSheetsCache.filter((s) => isUserAssignedToSheet(s, currentAuthUser?.uid));

  if (visibleSheets.length === 0) {
    sheetsGrid.innerHTML = `
      <div class="empty-campaigns glass-panel" style="grid-column: 1 / -1; padding: 40px 20px;">
        <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 12px;">
          ${isMasterUser ? "Nenhuma ficha cadastrada nesta campanha ainda." : "Você ainda não possui nenhuma ficha forjada nesta crônica."}
        </p>
        <button class="btn btn-primary" onclick="document.getElementById('btnOpenCreateSheet').click()">
          Forjar Primeira Ficha
        </button>
      </div>
    `;
    return;
  }

  visibleSheets.forEach((sheet) => {
    const card = document.createElement("article");
    card.className = "sheet-card glass-panel";
    card.setAttribute("data-id", sheet.id);

    const charName = sheet.name || "Sem Nome";
    const charClass = sheet.class || sheet.characterClass || "Aventureiro";
    const charRace = sheet.race || "Humano";
    const charLevel = sheet.level || 1;
    const avatarUrl = sheet.avatarUrl || "";

    const isBoreal = (sheet.system === "Boreal RPG" || activeCampaign?.system === "Boreal RPG");

    const hpMax = sheet.hpMax ?? sheet.maxHp ?? (isBoreal ? 10 : 12);
    const hpCurrent = sheet.hpCurrent ?? sheet.currentHp ?? hpMax;

    const secondLabel = isBoreal ? "Resiliência" : "Mana (PM)";
    const secondMax = isBoreal ? (sheet.resMax ?? 10) : (sheet.pmMax ?? sheet.maxMp ?? 6);
    const secondCurrent = isBoreal ? (sheet.resCurrent ?? secondMax) : (sheet.pmCurrent ?? sheet.currentMp ?? secondMax);

    const protMax = sheet.protMax ?? 0;
    const protCur = sheet.protCurrent ?? protMax;
    const protDisplay = isBoreal ? `${protCur}/${protMax}` : (sheet.protCurrent ?? sheet.protection ?? sheet.defense ?? sheet.ac ?? 0);

    const isOwner = isUserAssignedToSheet(sheet, currentAuthUser?.uid);
    const ownersDisplay = getSheetOwnersDisplayText(sheet);

    let avatarHtml = `<div class="sheet-avatar">${escapeHtml((charName || "P").charAt(0).toUpperCase())}</div>`;
    if (avatarUrl) {
      avatarHtml = `
        <div class="sheet-avatar">
          <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(charName)}" class="sheet-avatar-img" onerror="this.onerror=null; this.parentElement.textContent='${escapeHtml((charName || "P").charAt(0).toUpperCase())}';">
        </div>
      `;
    }

    card.innerHTML = `
      <div>
        <div class="sheet-card-header">
          ${avatarHtml}
          <div class="sheet-title-info">
            <h4 class="sheet-name" title="${escapeHtml(charName)}">${escapeHtml(charName)}</h4>
            <span class="sheet-class-level">${escapeHtml(charClass)} &bull; ${escapeHtml(charRace)} Nív. ${charLevel}</span>
          </div>
        </div>

        <div class="sheet-vitals-row" style="margin-top: 14px;">
          <div class="vital-stat">
            <span class="vital-stat-label">Vida (HP)</span>
            <span class="vital-stat-val vital-hp">${hpCurrent}/${hpMax}</span>
          </div>
          <div class="vital-stat">
            <span class="vital-stat-label">${secondLabel}</span>
            <span class="vital-stat-val vital-mp">${secondCurrent}/${secondMax}</span>
          </div>
          <div class="vital-stat">
            <span class="vital-stat-label">Proteção</span>
            <span class="vital-stat-val vital-ac">${protDisplay}</span>
          </div>
        </div>
      </div>

      <div class="sheet-card-footer">
        <div class="sheet-owner-badge" title="Jogadores atribuídos: ${escapeHtml(ownersDisplay)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span>${escapeHtml(ownersDisplay)}</span>
        </div>

        <div class="sheet-card-actions">
          <button type="button" class="btn btn-ghost btn-view-sheet" data-id="${sheet.id}" title="Abrir ficha completa">
            Abrir
          </button>
          ${isMasterUser ? `
            <button type="button" class="btn btn-ghost btn-assign-sheet" data-id="${sheet.id}" title="Atribuir jogadores">
              Atribuir
            </button>
          ` : ""}
          ${(isMasterUser || isOwner) ? `
            <button type="button" class="btn btn-ghost btn-delete-sheet" data-id="${sheet.id}" data-name="${escapeHtml(charName)}" style="color: var(--color-error);" title="Excluir ficha">
              Excluir
            </button>
          ` : ""}
        </div>
      </div>
    `;

    // Ações do card
    const header = card.querySelector(".sheet-card-header");
    if (header) {
      header.style.cursor = "pointer";
      header.addEventListener("click", () => openViewSheetModal(sheet));
    }

    const vitals = card.querySelector(".sheet-vitals-row");
    if (vitals) {
      vitals.style.cursor = "pointer";
      vitals.addEventListener("click", () => openViewSheetModal(sheet));
    }

    const btnView = card.querySelector(".btn-view-sheet");
    if (btnView) {
      btnView.addEventListener("click", () => openViewSheetModal(sheet));
    }

    const btnAssign = card.querySelector(".btn-assign-sheet");
    if (btnAssign) {
      btnAssign.addEventListener("click", () => openAssignSheetModal(sheet));
    }

    const btnDelete = card.querySelector(".btn-delete-sheet");
    if (btnDelete) {
      btnDelete.addEventListener("click", () => openConfirmDeleteSheetModal(sheet));
    }

    sheetsGrid.appendChild(card);
  });
}

// Modal Criar Ficha
if (btnOpenCreateSheet) {
  btnOpenCreateSheet.addEventListener("click", () => {
    if (formCreateSheet) formCreateSheet.reset();
    if (sheetAvatarPreview) sheetAvatarPreview.textContent = "🎭";

    // Popula o dropdown de jogadores
    if (sheetAssignPlayerGroup && sheetAssignPlayerSelect) {
      sheetAssignPlayerGroup.style.display = "block";

      if (isMasterUser) {
        sheetAssignPlayerSelect.disabled = false;
        sheetAssignPlayerSelect.innerHTML = `<option value="">Não atribuída (Mestre)</option>`;

        // Mestre como opção
        if (activeCampaign.masterId) {
          const mName = activeCampaign.masterName || "Mestre";
          sheetAssignPlayerSelect.innerHTML += `<option value="${activeCampaign.masterId}|${escapeHtml(mName)}">${escapeHtml(mName)} (Mestre)</option>`;
        }

        // Jogadores conectados
        (activeCampaign.playerDetails || []).forEach((p) => {
          if (p.uid !== activeCampaign.masterId) {
            sheetAssignPlayerSelect.innerHTML += `<option value="${p.uid}|${escapeHtml(p.name)}">${escapeHtml(p.name)} (${escapeHtml(p.role || "Jogador")})</option>`;
          }
        });
      } else {
        // Jogador comum criando para si mesmo
        sheetAssignPlayerSelect.disabled = true;
        const myName = currentAuthUser.displayName || currentAuthUser.email.split("@")[0];
        sheetAssignPlayerSelect.innerHTML = `<option value="${currentAuthUser.uid}|${escapeHtml(myName)}" selected>${escapeHtml(myName)} (Você)</option>`;
      }
    }
    openModalById("modal-ficha");
  });
}

if (formCreateSheet) {
  formCreateSheet.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeCampaign || !currentAuthUser) return;

    const name = document.getElementById("sheetName")?.value.trim();

    let assignedUid = currentAuthUser.uid;
    let assignedName = currentAuthUser.displayName || currentAuthUser.email.split("@")[0];
    let initialAssignedPlayers = [];

    if (isMasterUser) {
      if (sheetAssignPlayerSelect && sheetAssignPlayerSelect.value) {
        const [uid, pName] = sheetAssignPlayerSelect.value.split("|");
        assignedUid = uid;
        assignedName = pName;
        initialAssignedPlayers = [{ uid, name: pName }];
      } else {
        assignedUid = null;
        assignedName = "Não atribuída";
        initialAssignedPlayers = [];
      }
    } else {
      initialAssignedPlayers = [{ uid: assignedUid, name: assignedName }];
    }

    if (!name) {
      showToast("Por favor, informe o nome do personagem.", "error");
      return;
    }

    try {
      const btn = document.getElementById("btnSubmitCreateSheet");
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="btn-spinner"></span> <span>Salvando...</span>`;
      }

      const isBoreal = activeCampaign.system === "Boreal RPG";

      const newSheetData = {
        name,
        firstName: name.split(" ")[0] || name,
        lastName: name.split(" ").slice(1).join(" ") || "",
        class: isBoreal ? "Iniciado" : "Aventureiro",
        characterClass: isBoreal ? "Iniciado" : "Aventureiro",
        race: "Humano",
        level: 1,
        age: "",
        currencies: { rubi: 0, ouro: 0, prata: 0, bronze: 0 },
        avatarUrl: "",
        ownerId: assignedUid,
        ownerName: assignedName,
        assignedPlayers: initialAssignedPlayers,
        assignedUids: initialAssignedPlayers.map((p) => p.uid),
        system: activeCampaign.system || "Escória de Deus RPG",
        hpMax: isBoreal ? 10 : 12,
        maxHp: isBoreal ? 10 : 12,
        hpCurrent: isBoreal ? 10 : 12,
        currentHp: isBoreal ? 10 : 12,
        pmMax: 6,
        maxMp: 6,
        pmCurrent: 6,
        currentMp: 6,
        defense: 14,
        ac: 14,
        createdAt: serverTimestamp()
      };

      if (isBoreal) {
        newSheetData.resCurrent = 10;
        newSheetData.resMax = 10;
        newSheetData.protCurrent = 0;
        newSheetData.protMax = 0;
        newSheetData.protBase = 0;
        newSheetData.attributes = { corpo: 0, poder: 0, mente: 0 };
        newSheetData.skills = {};
        newSheetData.spirit = {
          nome: "Espírito Guardião",
          tipo: "Sabedoria",
          nivel: 1,
          avatarUrl: "",
          hpCurrent: 10,
          hpMax: 10,
          conexao: 0,
          protCurrent: 1,
          protMax: 1,
          dtFisico: 6,
          dtMagico: 6,
          dtMental: 6,
          attrCorpo: 1,
          attrPoder: 1,
          attrMente: 1,
          specialty: "",
          aparencia: "",
          personalidade: "",
          habitos: ""
        };
      }

      await addDoc(collection(db, "campaigns", activeCampaign.id, "sheets"), newSheetData);

      closeModalById("modal-ficha");
      formCreateSheet.reset();
      showToast("Ficha criada com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao criar ficha:", err);
      showToast("Não foi possível salvar a ficha: " + err.message, "error");
    } finally {
      const btn = document.getElementById("btnSubmitCreateSheet");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>Criar Ficha</span>`;
      }
    }
  });
}

// Modal Atribuir Ficha (Múltiplos Jogadores)
let sheetToAssign = null;
const assignedPlayersListEl = document.getElementById("assignedPlayersList");
const availablePlayersListEl = document.getElementById("availablePlayersList");

function openAssignSheetModal(sheet) {
  sheetToAssign = sheet;
  if (!activeCampaign) return;
  renderAssignSheetPlayersModal();
  openModalById("modalAssignSheet");
}

function renderAssignSheetPlayersModal() {
  if (!sheetToAssign || !activeCampaign || !assignedPlayersListEl || !availablePlayersListEl) return;

  const assignedList = getSheetAssignedList(sheetToAssign);
  const assignedUidsSet = new Set(assignedList.map((p) => p.uid));

  // Renderiza Jogadores Atribuídos
  assignedPlayersListEl.innerHTML = "";
  if (assignedList.length === 0) {
    assignedPlayersListEl.innerHTML = `<div class="assign-empty-msg">Nenhum jogador atribuído no momento (Apenas o Mestre possui acesso).</div>`;
  } else {
    assignedList.forEach((player) => {
      const row = document.createElement("div");
      row.className = "assign-player-row";
      const initial = (player.name || "J").charAt(0).toUpperCase();
      row.innerHTML = `
        <div class="assign-player-info">
          <span class="assign-player-avatar">${escapeHtml(initial)}</span>
          <span class="assign-player-name">${escapeHtml(player.name)}</span>
        </div>
        <button type="button" class="btn-remove-assigned" title="Remover jogador">&times;</button>
      `;
      row.querySelector(".btn-remove-assigned").addEventListener("click", async () => {
        await removePlayerFromSheetAssignment(player.uid);
      });
      assignedPlayersListEl.appendChild(row);
    });
  }

  // Monta lista de todos os membros da campanha disponíveis para atribuir
  const campaignCandidates = [];
  (activeCampaign.playerDetails || []).forEach((p) => {
    if (p.uid && !assignedUidsSet.has(p.uid)) {
      campaignCandidates.push({
        uid: p.uid,
        name: p.name || "Jogador",
        role: p.uid === activeCampaign.masterId ? "Mestre" : (p.role || "Jogador")
      });
    }
  });

  availablePlayersListEl.innerHTML = "";
  if (campaignCandidates.length === 0) {
    availablePlayersListEl.innerHTML = `<div class="assign-empty-msg">Todos os jogadores da campanha já estão atribuídos ou não há mais jogadores na sala.</div>`;
  } else {
    campaignCandidates.forEach((cand) => {
      const row = document.createElement("div");
      row.className = "assign-player-row";
      const initial = (cand.name || "J").charAt(0).toUpperCase();
      row.innerHTML = `
        <div class="assign-player-info">
          <span class="assign-player-avatar">${escapeHtml(initial)}</span>
          <span class="assign-player-name">${escapeHtml(cand.name)} <small style="color: var(--text-muted); font-weight: 400;">(${escapeHtml(cand.role)})</small></span>
        </div>
        <button type="button" class="btn-add-assigned">+ Adicionar</button>
      `;
      row.querySelector(".btn-add-assigned").addEventListener("click", async () => {
        await addPlayerToSheetAssignment({ uid: cand.uid, name: cand.name });
      });
      availablePlayersListEl.appendChild(row);
    });
  }
}

async function addPlayerToSheetAssignment(playerObj) {
  if (!sheetToAssign || !activeCampaign) return;
  const currentList = getSheetAssignedList(sheetToAssign);
  if (currentList.some((p) => p.uid === playerObj.uid)) return;

  const updatedList = [...currentList, { uid: playerObj.uid, name: playerObj.name }];
  await persistSheetAssignmentList(updatedList);
}

async function removePlayerFromSheetAssignment(uidToRemove) {
  if (!sheetToAssign || !activeCampaign) return;
  const currentList = getSheetAssignedList(sheetToAssign);
  const updatedList = currentList.filter((p) => p.uid !== uidToRemove);
  await persistSheetAssignmentList(updatedList);
}

async function persistSheetAssignmentList(updatedList) {
  if (!sheetToAssign || !activeCampaign) return;
  const assignedUids = updatedList.map((p) => p.uid);
  const primaryOwnerId = updatedList.length > 0 ? updatedList[0].uid : null;
  const ownerNameDisplay = updatedList.length > 0 ? updatedList.map((p) => p.name).join(", ") : "Não atribuída";

  const payload = {
    assignedPlayers: updatedList,
    assignedUids,
    ownerId: primaryOwnerId,
    ownerName: ownerNameDisplay
  };

  try {
    await updateDoc(doc(db, "campaigns", activeCampaign.id, "sheets", sheetToAssign.id), payload);
    sheetToAssign = { ...sheetToAssign, ...payload };
    const idx = campaignSheetsCache.findIndex((s) => s.id === sheetToAssign.id);
    if (idx !== -1) {
      campaignSheetsCache[idx] = { ...campaignSheetsCache[idx], ...payload };
      renderSheets();
    }
    renderAssignSheetPlayersModal();
    showToast("Atribuição da ficha atualizada!", "success");
  } catch (err) {
    console.error("Erro ao atualizar jogadores da ficha:", err);
    showToast("Erro ao atualizar jogadores da ficha.", "error");
  }
}

// Modal Confirmar Exclusão de Ficha
let sheetToDelete = null;
const modalConfirmDeleteSheet = document.getElementById("modalConfirmDeleteSheet");
const deleteSheetTargetName = document.getElementById("deleteSheetTargetName");
const btnConfirmDeleteSheet = document.getElementById("btnConfirmDeleteSheet");

function openConfirmDeleteSheetModal(sheet) {
  sheetToDelete = sheet;
  if (deleteSheetTargetName) deleteSheetTargetName.textContent = sheet.name;
  openModalById("modalConfirmDeleteSheet");
}

if (btnConfirmDeleteSheet) {
  btnConfirmDeleteSheet.addEventListener("click", async () => {
    if (!sheetToDelete || !activeCampaign) return;
    try {
      btnConfirmDeleteSheet.disabled = true;
      await deleteDoc(doc(db, "campaigns", activeCampaign.id, "sheets", sheetToDelete.id));
      closeModalById("modalConfirmDeleteSheet");
      showToast(`Ficha "${sheetToDelete.name}" foi destruída.`, "info");
    } catch (err) {
      console.error("Erro ao deletar ficha:", err);
      showToast("Erro ao excluir ficha.", "error");
    } finally {
      btnConfirmDeleteSheet.disabled = false;
    }
  });
}

// ==========================================================================
// 5. MODAL DETALHES E FICHA COMPLETA: ESCÓRIA DE DEUS RPG
// ==========================================================================
let currentViewingSheet = null;
let selectedQuickSwapSlotIndex = null;

const ED_SKILLS_LIST = [
  "Agilidade", "Animais", "Arte", "Atirar", "Conduzir", "Conhecimento",
  "Energia", "Enganação", "Esquiva", "Esporte", "Fortitude", "Furtividade",
  "Influência", "Intuição", "Investigação", "Ladinagem", "Luta", "Máquinas",
  "Medicina", "Mística", "Ofício", "Percepção", "Persuasão", "Sobrevivência",
  "Vitalidade", "Vontade"
];
const ED_DICE_CYCLE = ["-", "d4", "d6", "d8", "d10", "d12"];
const ED_ATTR_DICE_CYCLE = ["d4", "d6", "d8", "d10", "d12"];

function openViewSheetModal(sheet) {
  currentViewingSheet = { ...sheet };

  const isBoreal = (sheet.system === "Boreal RPG" || activeCampaign?.system === "Boreal RPG");
  const edBox = document.getElementById("edSheetBox");
  const borealBox = document.getElementById("borealSheetBox");

  if (isBoreal) {
    if (edBox) edBox.style.display = "none";
    if (borealBox) borealBox.style.display = "flex";
    openBorealSheetModal(sheet);
    return;
  }

  if (borealBox) borealBox.style.display = "none";
  if (edBox) edBox.style.display = "block";

  const isOwner = isUserAssignedToSheet(sheet, currentAuthUser?.uid);
  const canEdit = isMasterUser || isOwner;

  const sheetBox = document.getElementById("edSheetBox");
  const edBody = document.getElementById("edSheetBody");

  // Identidade e Cabeçalho
  const idInput = document.getElementById("viewSheetId");
  const firstNameInput = document.getElementById("edCharFirstName");
  const lastNameInput = document.getElementById("edCharLastName");
  const subtitleInput = document.getElementById("edCharSubtitle");
  const alignmentSelect = document.getElementById("edSheetAlignment");
  const raceInput = document.getElementById("edSheetRace");
  const levelInput = document.getElementById("viewSheetLevel");
  const ownerLabel = document.getElementById("viewSheetOwner");
  const avatarCircle = document.getElementById("viewSheetAvatar");
  const avatarUrlHidden = document.getElementById("viewSheetAvatarUrl");
  const portraitImg = document.getElementById("edPortraitImage");
  const portraitEmpty = document.getElementById("edPortraitEmpty");
  const accentPicker = document.getElementById("edSheetAccentPicker");
  const accentPreview = document.getElementById("edAccentSwatchPreview");
  const btnSave = document.getElementById("btnSaveSheetChanges");

  if (idInput) idInput.value = sheet.id;

  // Nome e Sobrenome
  let [fName, ...lNames] = (sheet.name || "Aventureiro").split(" ");
  if (sheet.firstName !== undefined) fName = sheet.firstName;
  if (sheet.lastName !== undefined) lNames = [sheet.lastName];

  if (firstNameInput) firstNameInput.value = fName || "";
  if (lastNameInput) lastNameInput.value = lNames.join(" ") || "";
  if (subtitleInput) subtitleInput.value = sheet.subtitle || (sheet.class ? `${sheet.class} • ${sheet.race || "Humano"}` : "");
  if (alignmentSelect) alignmentSelect.value = sheet.alignment || "Neutro";
  if (raceInput) raceInput.value = sheet.race || "Humano";
  if (levelInput) levelInput.value = sheet.level || 1;
  if (ownerLabel) ownerLabel.textContent = getSheetOwnersDisplayText(sheet);

  // Cor de Destaque (--sheet-accent)
  const accentColor = sheet.accentColor || "#dc2626";
  if (sheetBox) {
    sheetBox.style.setProperty("--sheet-accent", accentColor);
    sheetBox.style.setProperty("--sheet-accent-glow", `${accentColor}70`);
    sheetBox.style.setProperty("--sheet-accent-subtle", `${accentColor}20`);
  }
  if (accentPreview) accentPreview.style.background = accentColor;
  if (accentPicker) accentPicker.value = accentColor;

  // Retrato e Avatar
  const avUrl = sheet.avatarUrl || "";
  if (avatarUrlHidden) avatarUrlHidden.value = avUrl;
  if (avatarCircle) {
    if (avUrl) {
      avatarCircle.innerHTML = `<img src="${escapeHtml(avUrl)}" alt="Avatar" onerror="this.onerror=null; this.parentElement.textContent='${escapeHtml((sheet.name || "P").charAt(0).toUpperCase())}';">`;
    } else {
      avatarCircle.textContent = (sheet.name || "P").charAt(0).toUpperCase();
    }
  }

  if (portraitImg && portraitEmpty) {
    if (avUrl) {
      portraitImg.src = avUrl;
      portraitImg.style.display = "block";
      portraitEmpty.style.display = "none";
    } else {
      portraitImg.style.display = "none";
      portraitEmpty.style.display = "block";
    }
  }

  // Atributos (Físico, Mente, Alma)
  currentViewingSheet.attributes = sheet.attributes || {
    fisico: { dice: "d6", marks: 0 },
    mente: { dice: "d6", marks: 0 },
    alma: { dice: "d6", marks: 0 }
  };
  renderAttributes();

  // PV e PM Interativos
  const maxHp = sheet.hpMax ?? sheet.maxHp ?? 10;
  const currentHp = sheet.hpCurrent ?? sheet.currentHp ?? maxHp;
  const maxMp = sheet.pmMax ?? sheet.maxMp ?? 6;
  const currentMp = sheet.pmCurrent ?? sheet.currentMp ?? maxMp;

  currentViewingSheet.maxHp = maxHp;
  currentViewingSheet.currentHp = currentHp;
  currentViewingSheet.maxMp = maxMp;
  currentViewingSheet.currentMp = currentMp;

  const maxHpInput = document.getElementById("viewSheetMaxHp");
  const maxMpInput = document.getElementById("viewSheetMaxMp");
  if (maxHpInput) maxHpInput.value = maxHp;
  if (maxMpInput) maxMpInput.value = maxMp;

  renderPvGrid(currentHp, maxHp);
  renderPmGrid(currentMp, maxMp);

  // 26 Perícias
  currentViewingSheet.skills = sheet.skills || {};
  renderSkills();

  // Arcana
  currentViewingSheet.arcanas = sheet.arcanas || [];
  updateArcanaOutcome();
  renderArcanaSavedList();

  // Equipamentos 1 e 2
  currentViewingSheet.equip1 = sheet.equip1 || { icon: "⚔️", name: "Espada Longa", desc: "Lâmina de aço temperado", dice: "1d8", effect: "Crítico 19", skill: "Luta" };
  currentViewingSheet.equip2 = sheet.equip2 || { icon: "🏹", name: "Arco Curto", desc: "Madeira reforçada", dice: "1d6", effect: "Alcance 18m", skill: "Atirar" };

  setInputValue("nameEquip1", currentViewingSheet.equip1.name);
  setInputValue("descEquip1", currentViewingSheet.equip1.desc);
  setInputValue("diceEquip1", currentViewingSheet.equip1.dice);
  setInputValue("effectEquip1", currentViewingSheet.equip1.effect);
  setInputValue("skillEquip1", currentViewingSheet.equip1.skill);
  setElementText("iconSlotEquip1", currentViewingSheet.equip1.icon || "⚔️");

  setInputValue("nameEquip2", currentViewingSheet.equip2.name);
  setInputValue("descEquip2", currentViewingSheet.equip2.desc);
  setInputValue("diceEquip2", currentViewingSheet.equip2.dice);
  setInputValue("effectEquip2", currentViewingSheet.equip2.effect);
  setInputValue("skillEquip2", currentViewingSheet.equip2.skill);
  setElementText("iconSlotEquip2", currentViewingSheet.equip2.icon || "🏹");

  // Proteção 1 e 2 & Defesa (CA)
  currentViewingSheet.prot1 = sheet.prot1 || { icon: "🛡️", name: "Escudo de Ferro", desc: "Bloqueio reforçado", slots: "1 Espaço", effect: "+2 Defesa" };
  currentViewingSheet.prot2 = sheet.prot2 || { icon: "🦺", name: "Gibão de Couro", desc: "Armadura flexível", slots: "2 Espaços", effect: "Res. Corte" };

  setInputValue("nameProt1", currentViewingSheet.prot1.name);
  setInputValue("descProt1", currentViewingSheet.prot1.desc);
  setInputValue("slotsProt1", currentViewingSheet.prot1.slots);
  setInputValue("effectProt1", currentViewingSheet.prot1.effect);
  setElementText("iconSlotProt1", currentViewingSheet.prot1.icon || "🛡️");

  setInputValue("nameProt2", currentViewingSheet.prot2.name);
  setInputValue("descProt2", currentViewingSheet.prot2.desc);
  setInputValue("slotsProt2", currentViewingSheet.prot2.slots);
  setInputValue("effectProt2", currentViewingSheet.prot2.effect);
  setElementText("iconSlotProt2", currentViewingSheet.prot2.icon || "🦺");

  const acInput = document.getElementById("viewSheetAc");
  if (acInput) acInput.value = sheet.defense ?? sheet.ac ?? 14;

  // Troca Rápida (6 slots)
  currentViewingSheet.quickSwap = sheet.quickSwap || Array(6).fill(null);
  renderQuickSwapSlots();

  // Dinheiro (Tibares T$ e Ouro)
  setInputValue("edCoinsTibares", sheet.tibares ?? 50);
  setInputValue("edCoinsOuro", sheet.ouro ?? 0);

  // Mochila (Inventário)
  currentViewingSheet.backpack = sheet.backpack || [
    { id: "bp_1", name: "Tocha (3x)", slots: 1 },
    { id: "bp_2", name: "Ração de Viagem (5 dias)", slots: 1 },
    { id: "bp_3", name: "Corda de Cânhamo (15m)", slots: 1 }
  ];
  currentViewingSheet.backpackMaxSlots = sheet.backpackMaxSlots || 10;
  renderBackpack();

  // Notas Rápidas e Anotações
  setInputValue("edQuickConditionInput", sheet.conditions || "");
  setInputValue("viewSheetNotes", sheet.notes || "");

  // Inicializa estados de responsividade
  if (edBody) {
    if (!edBody.getAttribute("data-active-view")) edBody.setAttribute("data-active-view", "1-2");
    edBody.setAttribute("data-active-mobile", "1");
  }
  document.querySelectorAll(".ed-pill-tab[data-col]").forEach((t) => {
    t.classList.toggle("active", t.getAttribute("data-col") === "1");
  });

  // Controle de permissão de salvar
  if (btnSave) {
    btnSave.style.display = canEdit ? "inline-flex" : "none";
  }

  if (typeof storedSwitchSection === "function") {
    storedSwitchSection("sheet-view");
  } else {
    document.querySelectorAll(".dash-section").forEach((sec) => sec.classList.remove("active"));
    const secSheet = document.getElementById("section-sheet-view");
    if (secSheet) secSheet.classList.add("active");
  }

  showSheetMobilePill();
}

function setInputValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? "";
}

function setElementText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? "";
}

// --------------------------------------------------------------------------
// ATRIBUTOS E MARCAS DE RISCO (1-3 destaque, >3 ouro)
// --------------------------------------------------------------------------
function renderAttributes() {
  if (!currentViewingSheet) return;
  const attrs = currentViewingSheet.attributes || {};

  ["fisico", "mente", "alma"].forEach((attr) => {
    const data = attrs[attr] || { dice: "d8", marks: 0 };
    const btnDice = document.getElementById(`btnAttr${attr.charAt(0).toUpperCase() + attr.slice(1)}`);
    if (btnDice) {
      const numStr = (data.dice || "d8").replace("d", "");
      btnDice.innerHTML = `<span>${escapeHtml(numStr)}</span>`;
      btnDice.setAttribute("data-dice", data.dice || "d8");
    }

    const ticksContainer = document.querySelector(`.ed-risk-ticks[data-attr-risk="${attr}"]`);
    if (ticksContainer) {
      ticksContainer.querySelectorAll(".ed-tick").forEach((tick) => {
        const tickIdx = parseInt(tick.getAttribute("data-tick"), 10);
        tick.className = "ed-tick";
        if (tickIdx <= data.marks) {
          if (data.marks > 3 && tickIdx > 3) {
            tick.classList.add("gold");
          } else {
            tick.classList.add("marked");
          }
        }
      });
    }
  });
}

// Listeners de alternância de dado de atributo e marcas de risco
["fisico", "mente", "alma"].forEach((attr) => {
  const cap = attr.charAt(0).toUpperCase() + attr.slice(1);
  const btnDice = document.getElementById(`btnAttr${cap}`);
  if (btnDice) {
    btnDice.addEventListener("click", () => {
      if (!currentViewingSheet) return;
      currentViewingSheet.attributes = currentViewingSheet.attributes || {};
      currentViewingSheet.attributes[attr] = currentViewingSheet.attributes[attr] || { dice: "d8", marks: 0 };

      const curDice = currentViewingSheet.attributes[attr].dice || "d8";
      const nextIdx = (ED_ATTR_DICE_CYCLE.indexOf(curDice) + 1) % ED_ATTR_DICE_CYCLE.length;
      currentViewingSheet.attributes[attr].dice = ED_ATTR_DICE_CYCLE[nextIdx];
      renderAttributes();
    });
  }

  const ticksContainer = document.querySelector(`.ed-risk-ticks[data-attr-risk="${attr}"]`);
  if (ticksContainer) {
    ticksContainer.querySelectorAll(".ed-tick").forEach((tick) => {
      tick.addEventListener("click", () => {
        if (!currentViewingSheet) return;
        currentViewingSheet.attributes = currentViewingSheet.attributes || {};
        currentViewingSheet.attributes[attr] = currentViewingSheet.attributes[attr] || { dice: "d8", marks: 0 };

        const tickIdx = parseInt(tick.getAttribute("data-tick"), 10);
        const curMarks = currentViewingSheet.attributes[attr].marks || 0;

        // Se clicou na marca já ativa, reduz em 1; caso contrário, ativa até ela
        currentViewingSheet.attributes[attr].marks = curMarks === tickIdx ? tickIdx - 1 : tickIdx;
        renderAttributes();
      });
    });
  }
});

// --------------------------------------------------------------------------
// PONTOS VITAIS: PV E PM INTERATIVOS
// --------------------------------------------------------------------------
function renderPvGrid(currentHp, maxHp) {
  const container = document.getElementById("edPvSquareGrid");
  if (!container) return;
  container.innerHTML = "";
  const display = document.getElementById("edDisplayCurrentHp");
  const hidden = document.getElementById("viewSheetCurrentHp");
  if (display) display.textContent = currentHp;
  if (hidden) hidden.value = currentHp;

  for (let i = 1; i <= maxHp; i++) {
    const box = document.createElement("div");
    box.className = `ed-square-box ${i <= currentHp ? "active" : ""}`;
    box.title = `PV ${i} (Clique para alternar)`;
    box.addEventListener("click", () => {
      if (!currentViewingSheet) return;
      // Ao clicar em um quadrado já ativo, reduz em 1; se inativo, define até ele
      let newHp = currentViewingSheet.currentHp >= i ? i - 1 : i;
      currentViewingSheet.currentHp = Math.max(0, Math.min(newHp, currentViewingSheet.maxHp));
      currentViewingSheet.hpCurrent = currentViewingSheet.currentHp;
      renderPvGrid(currentViewingSheet.currentHp, currentViewingSheet.maxHp);
    });
    container.appendChild(box);
  }
}

function renderPmGrid(currentMp, maxMp) {
  const container = document.getElementById("edPmSquareGrid");
  if (!container) return;
  container.innerHTML = "";
  const display = document.getElementById("edDisplayCurrentMp");
  const hidden = document.getElementById("viewSheetCurrentMp");
  if (display) display.textContent = currentMp;
  if (hidden) hidden.value = currentMp;

  for (let i = 1; i <= maxMp; i++) {
    const box = document.createElement("div");
    box.className = `ed-square-box ${i <= currentMp ? "active" : ""}`;
    box.title = `PM ${i} (Clique para alternar)`;
    box.addEventListener("click", () => {
      if (!currentViewingSheet) return;
      let newMp = currentViewingSheet.currentMp >= i ? i - 1 : i;
      currentViewingSheet.currentMp = Math.max(0, Math.min(newMp, currentViewingSheet.maxMp));
      currentViewingSheet.pmCurrent = currentViewingSheet.currentMp;
      renderPmGrid(currentViewingSheet.currentMp, currentViewingSheet.maxMp);
    });
    container.appendChild(box);
  }
}

const inputMaxHp = document.getElementById("viewSheetMaxHp");
if (inputMaxHp) {
  inputMaxHp.addEventListener("change", (e) => {
    if (!currentViewingSheet) return;
    const newMax = Math.max(1, parseInt(e.target.value, 10) || 10);
    currentViewingSheet.maxHp = newMax;
    currentViewingSheet.hpMax = newMax;
    currentViewingSheet.currentHp = Math.min(currentViewingSheet.currentHp, newMax);
    renderPvGrid(currentViewingSheet.currentHp, newMax);
  });
}

const inputMaxMp = document.getElementById("viewSheetMaxMp");
if (inputMaxMp) {
  inputMaxMp.addEventListener("change", (e) => {
    if (!currentViewingSheet) return;
    const newMax = Math.max(0, parseInt(e.target.value, 10) || 6);
    currentViewingSheet.maxMp = newMax;
    currentViewingSheet.pmMax = newMax;
    currentViewingSheet.currentMp = Math.min(currentViewingSheet.currentMp, newMax);
    renderPmGrid(currentViewingSheet.currentMp, newMax);
  });
}

// --------------------------------------------------------------------------
// 26 PERÍCIAS (GRADE EM 2 COLUNAS + TRIÂNGULO VERMELHO + MARCAS)
// --------------------------------------------------------------------------
function renderSkills() {
  const container = document.getElementById("edSkillsList");
  if (!container || !currentViewingSheet) return;
  container.innerHTML = "";

  currentViewingSheet.skills = currentViewingSheet.skills || {};

  ED_SKILLS_LIST.forEach((skillName) => {
    if (!currentViewingSheet.skills[skillName]) {
      currentViewingSheet.skills[skillName] = { dice: "d4", marks: 0 };
    }
    const sk = currentViewingSheet.skills[skillName];
    if (!sk.dice || sk.dice === "-") sk.dice = "d4";

    const row = document.createElement("div");
    row.className = "ed-skill-item-row";

    const infoLeft = document.createElement("div");
    infoLeft.className = "ed-skill-info-left";

    const label = document.createElement("span");
    label.className = "ed-skill-label";
    label.textContent = skillName;
    infoLeft.appendChild(label);

    const ticksRow = document.createElement("div");
    ticksRow.className = "ed-skill-ticks-row";
    for (let t = 1; t <= 5; t++) {
      const tick = document.createElement("span");
      tick.className = `ed-skill-mini-tick ${t <= (sk.marks || 0) ? (t > 3 ? "gold" : "marked") : ""}`;
      tick.title = `Evolução ${t}`;
      tick.addEventListener("click", (e) => {
        e.stopPropagation();
        sk.marks = sk.marks === t ? t - 1 : t;
        renderSkills();
      });
      ticksRow.appendChild(tick);
    }
    infoLeft.appendChild(ticksRow);

    const dieBtn = document.createElement("button");
    dieBtn.type = "button";
    dieBtn.className = "ed-triangle-badge";
    const numDisplay = (sk.dice || "d4").replace("d", "");
    dieBtn.title = `Dado ${sk.dice} (Clique para alternar d4, d6, d8, d10, d12)`;
    dieBtn.innerHTML = `<span>${escapeHtml(numDisplay)}</span>`;
    dieBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const curIdx = ED_ATTR_DICE_CYCLE.indexOf(sk.dice || "d4");
      const nextIdx = (curIdx + 1) % ED_ATTR_DICE_CYCLE.length;
      sk.dice = ED_ATTR_DICE_CYCLE[nextIdx];
      renderSkills();
    });

    row.appendChild(infoLeft);
    row.appendChild(dieBtn);
    container.appendChild(row);
  });
}

// --------------------------------------------------------------------------
// CRIADOR DE ARCANA (FEITIÇOS & TÉCNICAS COM INDICADORES DINÂMICOS)
// --------------------------------------------------------------------------
function updateArcanaOutcome() {
  const funcao = document.getElementById("arcanaSelectFuncao")?.value || "Dano";
  const caracteristica = document.getElementById("arcanaSelectCaracteristica")?.value || "Fogo";
  const alvo = document.getElementById("arcanaSelectAlvo")?.value || "Toque";

  let distancia = "Toque";
  if (alvo === "Pessoal") distancia = "Pessoal";
  else if (alvo.includes("9m")) distancia = "9m";
  else if (alvo.includes("18m")) distancia = "18m";
  else if (alvo.includes("Área")) distancia = "Área 6m";
  else if (alvo.includes("Cone")) distancia = "Cone 9m";

  let basePm = 2;
  if (funcao === "Cura" || funcao === "Controle") basePm = 3;
  else if (funcao === "Evocação") basePm = 4;
  else if (funcao === "Sentidos") basePm = 1;

  let alvoMod = 0;
  if (alvo.includes("9m")) alvoMod = 1;
  else if (alvo.includes("18m")) alvoMod = 2;
  else if (alvo.includes("Área")) alvoMod = 3;
  else if (alvo.includes("Cone")) alvoMod = 2;

  const totalPm = Math.max(1, basePm + alvoMod);

  let acoes = "1 Ação";
  if (alvo.includes("Área") || funcao === "Evocação") acoes = "2 Ações";
  else if (funcao === "Movimento") acoes = "1 Ação / Reação";

  const valDist = document.getElementById("arcanaValDistancia");
  const valPm = document.getElementById("arcanaValPm");
  const valAcoes = document.getElementById("arcanaValAcoes");

  if (valDist) valDist.textContent = distancia;
  if (valPm) valPm.textContent = `${totalPm} PM`;
  if (valAcoes) valAcoes.textContent = acoes;

  return { funcao, caracteristica, alvo, distancia, pm: totalPm, acoes };
}

["arcanaSelectFuncao", "arcanaSelectCaracteristica", "arcanaSelectAlvo"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("change", updateArcanaOutcome);
});

const btnRegisterArcana = document.getElementById("btnRegisterArcana");
if (btnRegisterArcana) {
  btnRegisterArcana.addEventListener("click", () => {
    if (!currentViewingSheet) return;
    const outcome = updateArcanaOutcome();
    const nameInput = document.getElementById("arcanaCustomName");
    const customName = nameInput ? nameInput.value.trim() : "";

    const newArcana = {
      id: "arc_" + Date.now().toString(),
      name: customName || `${outcome.funcao} de ${outcome.caracteristica}`,
      funcao: outcome.funcao,
      caracteristica: outcome.caracteristica,
      alvo: outcome.alvo,
      distancia: outcome.distancia,
      pm: outcome.pm,
      acoes: outcome.acoes
    };

    currentViewingSheet.arcanas = currentViewingSheet.arcanas || [];
    currentViewingSheet.arcanas.push(newArcana);

    if (nameInput) nameInput.value = "";
    renderArcanaSavedList();
    showToast(`Arcana "${newArcana.name}" criada com sucesso!`, "success");
  });
}

function renderArcanaSavedList() {
  const container = document.getElementById("edArcanaSavedList");
  if (!container || !currentViewingSheet) return;
  container.innerHTML = "";

  const arcanas = currentViewingSheet.arcanas || [];
  if (arcanas.length === 0) {
    container.innerHTML = `<p style="font-size: 0.78rem; color: var(--text-muted); text-align: center; margin: 6px 0;">Nenhuma técnica de Arcana cadastrada.</p>`;
    return;
  }

  arcanas.forEach((arc, idx) => {
    const item = document.createElement("div");
    item.className = "ed-arcana-item-card";
    item.innerHTML = `
      <div>
        <div class="ed-arcana-item-title">${escapeHtml(arc.name || "Arcana")}</div>
        <div class="ed-arcana-item-meta">
          ${escapeHtml(arc.funcao)} (${escapeHtml(arc.caracteristica)}) • 🔵 ${arc.pm} PM • 🟢 ${escapeHtml(arc.distancia)} • 🟡 ${escapeHtml(arc.acoes)}
        </div>
      </div>
      <div style="display: flex; gap: 4px;">
        <button type="button" class="btn btn-ghost btn-xs btn-del-arcana" style="color: var(--color-error); padding: 2px 6px;" title="Remover técnica">✕</button>
      </div>
    `;

    item.querySelector(".btn-del-arcana")?.addEventListener("click", () => {
      arcanas.splice(idx, 1);
      renderArcanaSavedList();
    });

    container.appendChild(item);
  });
}

// --------------------------------------------------------------------------
// TROCA RÁPIDA (6 SLOTS CIRCULARES)
// --------------------------------------------------------------------------
function renderQuickSwapSlots() {
  const container = document.getElementById("edQuickSwapSlotsContainer");
  if (!container || !currentViewingSheet) return;
  container.innerHTML = "";

  currentViewingSheet.quickSwap = currentViewingSheet.quickSwap || Array(6).fill(null);

  for (let i = 0; i < 6; i++) {
    const item = currentViewingSheet.quickSwap[i];
    const slot = document.createElement("div");
    slot.className = "ed-quickslot-item";
    slot.title = item ? `${item.name} (Clique para ações de troca)` : `Slot ${i + 1} Vazio`;

    slot.innerHTML = `
      <span class="ed-quickslot-label">${item ? escapeHtml(item.name) : "NOME"}</span>
      <div class="ed-quickslot-circle">${item ? (item.icon || "⚔️") : ""}</div>
    `;

    slot.addEventListener("click", () => {
      if (item) {
        selectedQuickSwapSlotIndex = i;
        const modalTitle = document.getElementById("quickSwapItemName");
        if (modalTitle) modalTitle.textContent = item.name || `Item ${i + 1}`;
        openModalById("modalQuickSwapAction");
      } else {
        // Se vazio, transfere o primeiro item da mochila
        if (currentViewingSheet.backpack && currentViewingSheet.backpack.length > 0) {
          const bpItem = currentViewingSheet.backpack[0];
          currentViewingSheet.quickSwap[i] = {
            id: bpItem.id || Date.now().toString(),
            name: bpItem.name,
            icon: "🎒",
            desc: "Item da mochila",
            slots: bpItem.slots || 1
          };
          currentViewingSheet.backpack.splice(0, 1);
          renderQuickSwapSlots();
          renderBackpack();
          showToast(`"${bpItem.name}" movido para o Slot ${i + 1}!`, "info");
        } else {
          showToast("Mochila vazia para preencher o slot.", "info");
        }
      }
    });

    container.appendChild(slot);
  }
}

// Ações do Modal de Troca Rápida
document.getElementById("btnSwapToEquip1")?.addEventListener("click", () => {
  if (selectedQuickSwapSlotIndex === null || !currentViewingSheet) return;
  const item = currentViewingSheet.quickSwap[selectedQuickSwapSlotIndex];
  if (!item) return;

  const currentEquip1 = {
    name: document.getElementById("nameEquip1")?.value || "Espada Longa",
    desc: document.getElementById("descEquip1")?.value || "",
    dice: document.getElementById("diceEquip1")?.value || "1d8",
    effect: document.getElementById("effectEquip1")?.value || "",
    skill: document.getElementById("skillEquip1")?.value || "Luta",
    icon: document.getElementById("iconSlotEquip1")?.textContent || "⚔️"
  };

  // Aplica o item do slot no Equipamento 1
  setInputValue("nameEquip1", item.name);
  setInputValue("descEquip1", item.desc || "Item da Troca Rápida");
  setInputValue("diceEquip1", item.dice || "1d8");
  setInputValue("effectEquip1", item.effect || "Equipado");
  setInputValue("skillEquip1", item.skill || "Luta");
  setElementText("iconSlotEquip1", item.icon || "⚔️");

  // Coloca o que estava equipado de volta no slot
  currentViewingSheet.quickSwap[selectedQuickSwapSlotIndex] = currentEquip1;
  renderQuickSwapSlots();
  closeModalById("modalQuickSwapAction");
  showToast(`"${item.name}" equipado em Equipamento 1!`, "success");
});

document.getElementById("btnSwapToEquip2")?.addEventListener("click", () => {
  if (selectedQuickSwapSlotIndex === null || !currentViewingSheet) return;
  const item = currentViewingSheet.quickSwap[selectedQuickSwapSlotIndex];
  if (!item) return;

  const currentEquip2 = {
    name: document.getElementById("nameEquip2")?.value || "Arco Curto",
    desc: document.getElementById("descEquip2")?.value || "",
    dice: document.getElementById("diceEquip2")?.value || "1d6",
    effect: document.getElementById("effectEquip2")?.value || "",
    skill: document.getElementById("skillEquip2")?.value || "Atirar",
    icon: document.getElementById("iconSlotEquip2")?.textContent || "🏹"
  };

  setInputValue("nameEquip2", item.name);
  setInputValue("descEquip2", item.desc || "Item da Troca Rápida");
  setInputValue("diceEquip2", item.dice || "1d6");
  setInputValue("effectEquip2", item.effect || "Equipado");
  setInputValue("skillEquip2", item.skill || "Atirar");
  setElementText("iconSlotEquip2", item.icon || "🏹");

  currentViewingSheet.quickSwap[selectedQuickSwapSlotIndex] = currentEquip2;
  renderQuickSwapSlots();
  closeModalById("modalQuickSwapAction");
  showToast(`"${item.name}" equipado em Equipamento 2!`, "success");
});

document.getElementById("btnSwapToProt1")?.addEventListener("click", () => {
  if (selectedQuickSwapSlotIndex === null || !currentViewingSheet) return;
  const item = currentViewingSheet.quickSwap[selectedQuickSwapSlotIndex];
  if (!item) return;

  const currentProt1 = {
    name: document.getElementById("nameProt1")?.value || "Escudo de Ferro",
    desc: document.getElementById("descProt1")?.value || "",
    slots: document.getElementById("slotsProt1")?.value || "1 Espaço",
    effect: document.getElementById("effectProt1")?.value || "+2 Defesa",
    icon: document.getElementById("iconSlotProt1")?.textContent || "🛡️"
  };

  setInputValue("nameProt1", item.name);
  setInputValue("descProt1", item.desc || "Proteção");
  setInputValue("slotsProt1", item.slots || "1 Espaço");
  setInputValue("effectProt1", item.effect || "+2 Defesa");
  setElementText("iconSlotProt1", item.icon || "🛡️");

  currentViewingSheet.quickSwap[selectedQuickSwapSlotIndex] = currentProt1;
  renderQuickSwapSlots();
  closeModalById("modalQuickSwapAction");
  showToast(`"${item.name}" equipado em Proteção 1!`, "success");
});

document.getElementById("btnSwapToProt2")?.addEventListener("click", () => {
  if (selectedQuickSwapSlotIndex === null || !currentViewingSheet) return;
  const item = currentViewingSheet.quickSwap[selectedQuickSwapSlotIndex];
  if (!item) return;

  const currentProt2 = {
    name: document.getElementById("nameProt2")?.value || "Gibão de Couro",
    desc: document.getElementById("descProt2")?.value || "",
    slots: document.getElementById("slotsProt2")?.value || "2 Espaços",
    effect: document.getElementById("effectProt2")?.value || "Res. Corte",
    icon: document.getElementById("iconSlotProt2")?.textContent || "🦺"
  };

  setInputValue("nameProt2", item.name);
  setInputValue("descProt2", item.desc || "Armadura");
  setInputValue("slotsProt2", item.slots || "2 Espaços");
  setInputValue("effectProt2", item.effect || "Res. Corte");
  setElementText("iconSlotProt2", item.icon || "🦺");

  currentViewingSheet.quickSwap[selectedQuickSwapSlotIndex] = currentProt2;
  renderQuickSwapSlots();
  closeModalById("modalQuickSwapAction");
  showToast(`"${item.name}" equipado em Proteção 2!`, "success");
});

document.getElementById("btnSwapToBackpack")?.addEventListener("click", () => {
  if (selectedQuickSwapSlotIndex === null || !currentViewingSheet) return;
  const item = currentViewingSheet.quickSwap[selectedQuickSwapSlotIndex];
  if (!item) return;

  currentViewingSheet.backpack = currentViewingSheet.backpack || [];
  currentViewingSheet.backpack.push({
    id: item.id || Date.now().toString(),
    name: item.name,
    slots: parseInt(item.slots, 10) || 1
  });
  currentViewingSheet.quickSwap[selectedQuickSwapSlotIndex] = null;

  renderQuickSwapSlots();
  renderBackpack();
  closeModalById("modalQuickSwapAction");
  showToast(`"${item.name}" guardado na mochila!`, "info");
});

document.getElementById("btnSwapClearSlot")?.addEventListener("click", () => {
  if (selectedQuickSwapSlotIndex === null || !currentViewingSheet) return;
  currentViewingSheet.quickSwap[selectedQuickSwapSlotIndex] = null;
  renderQuickSwapSlots();
  closeModalById("modalQuickSwapAction");
  showToast("Slot da Troca Rápida liberado.", "info");
});

// --------------------------------------------------------------------------
// MOCHILA (INVENTÁRIO COM GESTÃO DE ESPAÇOS E ENVIO DIRETO)
// --------------------------------------------------------------------------
function renderBackpack() {
  const list = document.getElementById("edBackpackItemsList");
  const occupiedEl = document.getElementById("edBackpackSlotsOccupied");
  const maxEl = document.getElementById("edBackpackSlotsMax");
  if (!list || !currentViewingSheet) return;
  list.innerHTML = "";

  currentViewingSheet.backpack = currentViewingSheet.backpack || [];
  const maxSlots = currentViewingSheet.backpackMaxSlots || 10;
  let occupiedSlots = 0;

  currentViewingSheet.backpack.forEach((item, idx) => {
    occupiedSlots += (parseInt(item.slots, 10) || 1);

    const card = document.createElement("div");
    card.className = "ed-backpack-item-card";
    card.innerHTML = `
      <div class="ed-backpack-item-main">
        <span class="ed-backpack-item-name">${escapeHtml(item.name)}</span>
        <span class="ed-backpack-item-slots">${item.slots || 1} esp.</span>
      </div>
      <div class="ed-backpack-item-actions">
        <button type="button" class="btn-quickswap-transfer" title="Enviar diretamente para Troca Rápida">⚡ Troca Rápida</button>
        <button type="button" class="btn btn-ghost btn-xs btn-del-bp" style="color: var(--color-error); padding: 2px 6px;">✕</button>
      </div>
    `;

    card.querySelector(".btn-quickswap-transfer")?.addEventListener("click", () => {
      currentViewingSheet.quickSwap = currentViewingSheet.quickSwap || Array(6).fill(null);
      const emptyIdx = currentViewingSheet.quickSwap.findIndex(s => s === null);
      if (emptyIdx === -1) {
        showToast("Todos os 6 slots de Troca Rápida estão ocupados!", "error");
        return;
      }
      currentViewingSheet.quickSwap[emptyIdx] = {
        id: item.id || Date.now().toString(),
        name: item.name,
        icon: "⚔️",
        desc: "Item da mochila",
        slots: item.slots || 1
      };
      currentViewingSheet.backpack.splice(idx, 1);
      renderQuickSwapSlots();
      renderBackpack();
      showToast(`"${item.name}" enviado para a Troca Rápida (Slot ${emptyIdx + 1})!`, "success");
    });

    card.querySelector(".btn-del-bp")?.addEventListener("click", () => {
      currentViewingSheet.backpack.splice(idx, 1);
      renderBackpack();
    });

    list.appendChild(card);
  });

  if (occupiedEl) occupiedEl.textContent = occupiedSlots;
  if (maxEl) maxEl.textContent = maxSlots;
}

const btnAddBackpackItem = document.getElementById("btnAddNewBackpackItem");
if (btnAddBackpackItem) {
  btnAddBackpackItem.addEventListener("click", () => {
    if (!currentViewingSheet) return;
    const nameInput = document.getElementById("edNewBackpackName");
    const slotsInput = document.getElementById("edNewBackpackSlots");
    const itemName = nameInput ? nameInput.value.trim() : "";
    const slots = parseInt(slotsInput?.value, 10) || 1;

    if (!itemName) {
      showToast("Informe o nome do item para adicionar à mochila.", "error");
      return;
    }

    currentViewingSheet.backpack = currentViewingSheet.backpack || [];
    currentViewingSheet.backpack.push({
      id: "bp_" + Date.now().toString(),
      name: itemName,
      slots
    });

    if (nameInput) nameInput.value = "";
    if (slotsInput) slotsInput.value = "1";
    renderBackpack();
    showToast(`"${itemName}" adicionado à mochila.`, "success");
  });
}

// --------------------------------------------------------------------------
// RETRATO / FOTO MODAL
// --------------------------------------------------------------------------
function applyNewPortrait(url) {
  if (!currentViewingSheet) return;
  currentViewingSheet.avatarUrl = url;

  const hidden = document.getElementById("viewSheetAvatarUrl");
  if (hidden) hidden.value = url;

  const portraitImg = document.getElementById("edPortraitImage");
  const portraitEmpty = document.getElementById("edPortraitEmpty");
  const avatarCircle = document.getElementById("viewSheetAvatar");

  if (portraitImg && portraitEmpty) {
    portraitImg.src = url;
    portraitImg.style.display = "block";
    portraitEmpty.style.display = "none";
  }
  if (avatarCircle) {
    avatarCircle.innerHTML = `<img src="${escapeHtml(url)}" alt="Avatar">`;
  }

  closeModalById("modalSheetPortrait");
  showToast("Retrato atualizado!", "success");
}

// --------------------------------------------------------------------------
// SELETOR DE COR DE DESTAQUE (--sheet-accent)
// --------------------------------------------------------------------------
const accentPicker = document.getElementById("edSheetAccentPicker");
const accentSwatch = document.getElementById("edAccentSwatchPreview");
const sheetBoxContainer = document.getElementById("edSheetBox");

if (accentPicker && sheetBoxContainer) {
  accentPicker.addEventListener("input", (e) => {
    const col = e.target.value;
    sheetBoxContainer.style.setProperty("--sheet-accent", col);
    sheetBoxContainer.style.setProperty("--sheet-accent-glow", `${col}70`);
    sheetBoxContainer.style.setProperty("--sheet-accent-subtle", `${col}20`);
    if (accentSwatch) accentSwatch.style.background = col;
    if (currentViewingSheet) currentViewingSheet.accentColor = col;
  });
}

// --------------------------------------------------------------------------
// EXPANSÃO DO BLOCO DE ANOTAÇÕES
// --------------------------------------------------------------------------
const btnToggleExpandNotes = document.getElementById("btnToggleExpandNotes");
const cardNotes = document.getElementById("edCardNotes");
if (btnToggleExpandNotes && cardNotes) {
  btnToggleExpandNotes.addEventListener("click", () => {
    cardNotes.classList.toggle("expanded");
    btnToggleExpandNotes.textContent = cardNotes.classList.contains("expanded") ? "↕ Reduzir" : "↕ Expandir";
  });
}

// --------------------------------------------------------------------------
// NAVEGAÇÃO RESPONSIVA: DESKTOP MÉDIO E MOBILE
// --------------------------------------------------------------------------
const btnMedPrev = document.getElementById("btnMedPrevCols");
const btnMedNext = document.getElementById("btnMedNextCols");
const medIndicator = document.getElementById("edMedNavIndicator");
const edBodyContainer = document.getElementById("edSheetBody");

if (btnMedPrev && edBodyContainer) {
  btnMedPrev.addEventListener("click", () => {
    edBodyContainer.setAttribute("data-active-view", "1-2");
    if (medIndicator) medIndicator.textContent = "Colunas 1 & 2";
  });
}
if (btnMedNext && edBodyContainer) {
  btnMedNext.addEventListener("click", () => {
    edBodyContainer.setAttribute("data-active-view", "2-3");
    if (medIndicator) medIndicator.textContent = "Colunas 2 & 3";
  });
}

// Pílula Móvel Flutuante (< 768px)
const pillTabs = document.querySelectorAll(".ed-pill-tab[data-col]");
pillTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const col = tab.getAttribute("data-col");
    if (!col) return;
    if (edBodyContainer) edBodyContainer.setAttribute("data-active-mobile", col);
    pillTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    updateEdPillIndicator();
  });
});

// --------------------------------------------------------------------------
// SALVAR TODAS AS ALTERAÇÕES DA FICHA (PERSISTÊNCIA NO CLOUD FIRESTORE)
// --------------------------------------------------------------------------
const btnSaveSheetChanges = document.getElementById("btnSaveSheetChanges");
if (btnSaveSheetChanges) {
  btnSaveSheetChanges.addEventListener("click", async () => {
    if (!currentViewingSheet || !activeCampaign) return;

    if (currentViewingSheet.system === "Boreal RPG" || activeCampaign?.system === "Boreal RPG") {
      await saveBorealSheet(false);
      return;
    }

    const fName = document.getElementById("edCharFirstName")?.value.trim() || "";
    const lName = document.getElementById("edCharLastName")?.value.trim() || "";
    const fullName = (fName + " " + lName).trim() || currentViewingSheet.name || "Aventureiro";

    const subtitle = document.getElementById("edCharSubtitle")?.value.trim() || "";
    const alignment = document.getElementById("edSheetAlignment")?.value || "Neutro";
    const race = document.getElementById("edSheetRace")?.value.trim() || "Humano";
    const level = parseInt(document.getElementById("viewSheetLevel")?.value, 10) || 1;
    const ac = parseInt(document.getElementById("viewSheetAc")?.value, 10) || 14;

    const currentHp = currentViewingSheet.currentHp ?? 10;
    const maxHp = currentViewingSheet.maxHp ?? 10;
    const currentMp = currentViewingSheet.currentMp ?? 6;
    const maxMp = currentViewingSheet.maxMp ?? 6;

    const avatarUrl = document.getElementById("viewSheetAvatarUrl")?.value.trim() || currentViewingSheet.avatarUrl || "";
    const accentColor = currentViewingSheet.accentColor || "#dc2626";

    // Equipamentos 1 & 2
    const equip1 = {
      name: document.getElementById("nameEquip1")?.value.trim() || "Espada Longa",
      desc: document.getElementById("descEquip1")?.value.trim() || "",
      dice: document.getElementById("diceEquip1")?.value.trim() || "1d8",
      effect: document.getElementById("effectEquip1")?.value.trim() || "",
      skill: document.getElementById("skillEquip1")?.value.trim() || "Luta",
      icon: document.getElementById("iconSlotEquip1")?.textContent || "⚔️"
    };

    const equip2 = {
      name: document.getElementById("nameEquip2")?.value.trim() || "Arco Curto",
      desc: document.getElementById("descEquip2")?.value.trim() || "",
      dice: document.getElementById("diceEquip2")?.value.trim() || "1d6",
      effect: document.getElementById("effectEquip2")?.value.trim() || "",
      skill: document.getElementById("skillEquip2")?.value.trim() || "Atirar",
      icon: document.getElementById("iconSlotEquip2")?.textContent || "🏹"
    };

    // Proteção 1 & 2
    const prot1 = {
      name: document.getElementById("nameProt1")?.value.trim() || "Escudo de Ferro",
      desc: document.getElementById("descProt1")?.value.trim() || "",
      slots: document.getElementById("slotsProt1")?.value.trim() || "1 Espaço",
      effect: document.getElementById("effectProt1")?.value.trim() || "+2 Defesa",
      icon: document.getElementById("iconSlotProt1")?.textContent || "🛡️"
    };

    const prot2 = {
      name: document.getElementById("nameProt2")?.value.trim() || "Gibão de Couro",
      desc: document.getElementById("descProt2")?.value.trim() || "",
      slots: document.getElementById("slotsProt2")?.value.trim() || "2 Espaços",
      effect: document.getElementById("effectProt2")?.value.trim() || "Res. Corte",
      icon: document.getElementById("iconSlotProt2")?.textContent || "🦺"
    };

    const tibares = parseInt(document.getElementById("edCoinsTibares")?.value, 10) || 0;
    const ouro = parseInt(document.getElementById("edCoinsOuro")?.value, 10) || 0;
    const conditions = document.getElementById("edQuickConditionInput")?.value.trim() || "";
    const notes = document.getElementById("viewSheetNotes")?.value.trim() || "";

    try {
      btnSaveSheetChanges.disabled = true;
      btnSaveSheetChanges.innerHTML = `<span class="btn-spinner"></span> <span>Salvando...</span>`;

      const payload = {
        name: fullName,
        firstName: fName,
        lastName: lName,
        class: subtitle || currentViewingSheet.class || currentViewingSheet.characterClass || "Aventureiro",
        characterClass: subtitle || currentViewingSheet.characterClass || currentViewingSheet.class || "Aventureiro",
        subtitle,
        alignment,
        race,
        level,
        defense: ac,
        ac,
        currentHp,
        hpCurrent: currentHp,
        maxHp,
        hpMax: maxHp,
        currentMp,
        pmCurrent: currentMp,
        maxMp,
        pmMax: maxMp,
        avatarUrl,
        accentColor,
        attributes: currentViewingSheet.attributes || {},
        skills: currentViewingSheet.skills || {},
        arcanas: currentViewingSheet.arcanas || [],
        equip1,
        equip2,
        prot1,
        prot2,
        quickSwap: currentViewingSheet.quickSwap || Array(6).fill(null),
        backpack: currentViewingSheet.backpack || [],
        tibares,
        ouro,
        conditions,
        notes
      };

      await updateDoc(doc(db, "campaigns", activeCampaign.id, "sheets", currentViewingSheet.id), payload);

      currentViewingSheet = { ...currentViewingSheet, ...payload };
      const cachedIdx = campaignSheetsCache.findIndex((s) => s.id === currentViewingSheet.id);
      if (cachedIdx !== -1) {
        campaignSheetsCache[cachedIdx] = { ...campaignSheetsCache[cachedIdx], ...payload };
        renderSheets();
      }

      showToast("Ficha salva com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao salvar alterações da ficha:", err);
      showToast("Erro ao salvar ficha: " + err.message, "error");
    } finally {
      btnSaveSheetChanges.disabled = false;
      btnSaveSheetChanges.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
          <polyline points="17 21 17 13 7 13 7 21"></polyline>
          <polyline points="7 3 7 8 15 8"></polyline>
        </svg>
        <span>Salvar Ficha</span>
      `;
    }
  });
}

// Retornar da visualização dedicada da ficha para a campanha
const btnBackToCampaignFromSheet = document.getElementById("btnBackToCampaignFromSheet");
if (btnBackToCampaignFromSheet) {
  btnBackToCampaignFromSheet.addEventListener("click", () => {
    const bottomNav = document.getElementById("mobileBottomNav");
    if (bottomNav) bottomNav.style.display = "";
    const sheetNavBtn = document.getElementById("mobileNavBtnSheet");
    if (sheetNavBtn) sheetNavBtn.style.display = "none";
    const borealPill = document.getElementById("borealMobileColumnPill");
    if (borealPill) borealPill.style.display = "";
    const edPill = document.getElementById("edMobileColumnPill");
    if (edPill) edPill.style.display = "";

    if (typeof storedSwitchSection === "function") {
      storedSwitchSection("campaign-detail");
    } else {
      document.querySelectorAll(".dash-section").forEach((sec) => sec.classList.remove("active"));
      const secCamp = document.getElementById("section-campaign-detail");
      if (secCamp) secCamp.classList.add("active");
    }
    renderSheets();
  });
}


// ==========================================================================
// 6. ABA 2: JOGADORES (PLAYERS)
// ==========================================================================
const userProfileCache = new Map();

async function getPlayerPhoto(uid) {
  if (!uid) return null;
  if (userProfileCache.has(uid)) return userProfileCache.get(uid);
  const localPhoto = localStorage.getItem(`veu_avatar_${uid}`);
  if (localPhoto) {
    userProfileCache.set(uid, localPhoto);
    return localPhoto;
  }
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists() && snap.data().photoURL) {
      const pUrl = snap.data().photoURL;
      localStorage.setItem(`veu_avatar_${uid}`, pUrl);
      userProfileCache.set(uid, pUrl);
      return pUrl;
    }
  } catch (e) {
    console.warn("Erro ao buscar foto do player:", e);
  }
  return null;
}

function listenPlayers() {
  if (!campPlayersList || !activeCampaign) return;
  campPlayersList.innerHTML = "";

  const players = activeCampaign.playerDetails || [];

  players.forEach((p) => {
    const isThisMaster = p.uid === activeCampaign.masterId;
    const isSelf = p.uid === currentAuthUser?.uid;
    const item = document.createElement("div");
    item.className = "player-item";

    const initial = (p.name || "A").charAt(0).toUpperCase();
    const directPhoto = p.photoURL || p.avatarUrl || localStorage.getItem(`veu_avatar_${p.uid}`);

    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div class="user-avatar player-avatar-box" data-uid="${p.uid}" style="width: 38px; height: 38px; min-width: 38px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.08); border: 1.5px solid var(--glass-border); font-size: 0.95rem; font-weight: 700;">
          ${directPhoto ? `<img src="${escapeHtml(directPhoto)}" alt="${escapeHtml(p.name)}" style="width: 100%; height: 100%; object-fit: cover;">` : initial}
        </div>
        <div>
          <div style="font-weight: 600; font-size: 0.92rem;">${escapeHtml(p.name)} ${isSelf ? '<span style="font-size: 0.72rem; color: var(--accent-primary);">(Você)</span>' : ""}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(p.email || "")}</div>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="badge-tag ${isThisMaster ? "badge-master" : "badge-player"}" style="font-size: 0.72rem;">
          ${isThisMaster ? "Mestre" : "Jogador"}
        </span>
        ${(isMasterUser && !isThisMaster) ? `
          <button type="button" class="btn btn-ghost btn-remove-player" data-uid="${p.uid}" data-name="${escapeHtml(p.name)}" style="padding: 4px 8px; font-size: 0.76rem; color: var(--color-error);" title="Remover jogador">
            Remover
          </button>
        ` : ""}
      </div>
    `;

    if (!directPhoto) {
      getPlayerPhoto(p.uid).then((photo) => {
        if (photo) {
          const box = item.querySelector(`.player-avatar-box[data-uid="${p.uid}"]`);
          if (box) {
            box.innerHTML = `<img src="${photo}" alt="${escapeHtml(p.name)}" style="width: 100%; height: 100%; object-fit: cover;">`;
          }
        }
      });
    }

    const btnRemove = item.querySelector(".btn-remove-player");
    if (btnRemove) {
      btnRemove.addEventListener("click", () => openRemovePlayerModal(p));
    }

    campPlayersList.appendChild(item);
  });
}

// Modal Remover Jogador
let playerToRemove = null;
const modalRemovePlayer = document.getElementById("modalRemovePlayer");
const removePlayerTargetName = document.getElementById("removePlayerTargetName");
const btnConfirmRemovePlayer = document.getElementById("btnConfirmRemovePlayer");

function openRemovePlayerModal(player) {
  playerToRemove = player;
  if (removePlayerTargetName) removePlayerTargetName.textContent = player.name;
  openModalById("modalRemovePlayer");
}

if (btnConfirmRemovePlayer) {
  btnConfirmRemovePlayer.addEventListener("click", async () => {
    if (!playerToRemove || !activeCampaign) return;
    try {
      btnConfirmRemovePlayer.disabled = true;

      // Remove dos arrays players e playerDetails
      const updatedPlayers = (activeCampaign.players || []).filter((uid) => uid !== playerToRemove.uid);
      const updatedDetails = (activeCampaign.playerDetails || []).filter((p) => p.uid !== playerToRemove.uid);

      await updateDoc(doc(db, "campaigns", activeCampaign.id), {
        players: updatedPlayers,
        playerDetails: updatedDetails
      });

      closeModalById("modalRemovePlayer");
      showToast(`Jogador "${playerToRemove.name}" foi removido da mesa.`, "info");
    } catch (err) {
      console.error("Erro ao remover jogador:", err);
      showToast("Não foi possível remover o jogador.", "error");
    } finally {
      btnConfirmRemovePlayer.disabled = false;
    }
  });
}

// ==========================================================================
// 7. ABA 3: ESCUDO DO MESTRE (GM SCREEN)
// ==========================================================================

// Resumo dos Players (HUD Vital)
function renderGmVitalsHud() {
  if (!gmVitalsGrid) return;
  gmVitalsGrid.innerHTML = "";

  if (campaignSheetsCache.length === 0) {
    gmVitalsGrid.innerHTML = `<p style="color: var(--text-muted); font-size: 0.88rem;">Nenhuma ficha disponível para monitorar.</p>`;
    return;
  }

  campaignSheetsCache.forEach((sheet) => {
    const card = document.createElement("div");
    card.className = "gm-vital-card";

    const isBoreal = sheet.system === "Boreal RPG" || activeCampaign?.system === "Boreal RPG";
    const hpMax = sheet.hpMax ?? sheet.maxHp ?? 10;
    const hpCur = sheet.hpCurrent ?? sheet.currentHp ?? hpMax;
    const hpPercent = hpMax > 0 ? Math.max(0, Math.min(100, Math.round((hpCur / hpMax) * 100))) : 100;

    const resMax = sheet.resMax ?? 10;
    const resCur = sheet.resCurrent ?? resMax;
    const resPercent = resMax > 0 ? Math.max(0, Math.min(100, Math.round((resCur / resMax) * 100))) : 100;

    const charName = sheet.name || "Personagem";
    const avatarUrl = sheet.avatarUrl || "";
    let avatarHtml = `<div class="user-avatar" style="width: 36px; height: 36px; min-width: 36px; border-radius: 50%; background: rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; border: 1px solid var(--glass-border);">${escapeHtml(charName.charAt(0).toUpperCase())}</div>`;
    if (avatarUrl) {
      avatarHtml = `<img src="${escapeHtml(avatarUrl)}" class="gm-vital-avatar" alt="${escapeHtml(charName)}" onerror="this.style.display='none'">`;
    }

    // Badge de Defesa / DTs
    let defenseBadge = `<span class="badge-tag badge-system" style="font-size: 0.72rem;">CA ${sheet.ac || sheet.defense || 10}</span>`;
    if (isBoreal) {
      const corpo = sheet.attributes?.corpo || 0;
      const poder = sheet.attributes?.poder || 0;
      const mente = sheet.attributes?.mente || 0;
      const fort = sheet.skills?.Fortitude || 0;
      const mist = sheet.skills?.Mística || 0;
      const vont = sheet.skills?.Vontade || 0;
      const dtF = 6 + corpo + fort;
      const dtM = 6 + poder + mist;
      const dtMen = 6 + mente + vont;
      defenseBadge = `<span class="badge-tag badge-system" style="font-size: 0.68rem;" title="DT Físico / Mágico / Mental">DT ${dtF}/${dtM}/${dtMen}</span>`;
    }

    card.innerHTML = `
      <div class="gm-vital-card-header" style="cursor: pointer;" title="Clique para abrir ficha completa">
        <div style="display: flex; align-items: center; gap: 10px;">
          ${avatarHtml}
          <div>
            <strong style="font-size: 0.95rem;">${escapeHtml(charName)}</strong>
            <div style="font-size: 0.74rem; color: var(--text-muted);">${escapeHtml(sheet.class || sheet.characterClass || sheet.ownerName || "Sem jogador")}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          ${defenseBadge}
          <button type="button" class="btn btn-ghost btn-view-sheet-hud" style="padding: 2px 6px; font-size: 0.75rem;" title="Abrir ficha completa">
            👁️
          </button>
        </div>
      </div>

      <!-- Barra de Vida -->
      <div>
        <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 4px;">
          <span>❤️ Vida (HP)</span>
          <strong class="vital-hp">${hpCur}/${hpMax}</strong>
        </div>
        <div class="hp-bar-container">
          <div class="hp-bar-fill" style="width: ${hpPercent}%;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <div class="gm-hp-controls">
            <button type="button" class="btn-vital-step btn-hp-minus" data-id="${sheet.id}" title="-1 HP">-1</button>
            <button type="button" class="btn-vital-step btn-hp-plus" data-id="${sheet.id}" title="+1 HP">+1</button>
          </div>
          <button type="button" class="btn btn-ghost btn-add-to-init" style="padding: 2px 8px; font-size: 0.72rem;" title="Adicionar ao combate">
            + Iniciativa
          </button>
        </div>
      </div>

      ${isBoreal ? `
      <!-- Barra de Resiliência (Boreal RPG) -->
      <div style="border-top: 1px dashed var(--glass-border); padding-top: 6px;">
        <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 4px;">
          <span style="color: #60a5fa;">🧠 Resiliência</span>
          <strong style="color: #60a5fa;">${resCur}/${resMax}</strong>
        </div>
        <div class="res-bar-container">
          <div class="res-bar-fill" style="width: ${resPercent}%;"></div>
        </div>
        <div class="gm-hp-controls" style="margin-top: 4px;">
          <button type="button" class="btn-vital-step btn-res-minus" data-id="${sheet.id}" title="-1 Res">-1</button>
          <button type="button" class="btn-vital-step btn-res-plus" data-id="${sheet.id}" title="+1 Res">+1</button>
        </div>
      </div>
      ` : ""}
    `;

    const hudHeader = card.querySelector(".gm-vital-card-header");
    if (hudHeader) {
      hudHeader.addEventListener("click", () => openViewSheetModal(sheet));
    }
    const btnHudView = card.querySelector(".btn-view-sheet-hud");
    if (btnHudView) {
      btnHudView.addEventListener("click", (e) => {
        e.stopPropagation();
        openViewSheetModal(sheet);
      });
    }

    card.querySelector(".btn-hp-minus").addEventListener("click", () => adjustSheetHp(sheet, -1));
    card.querySelector(".btn-hp-plus").addEventListener("click", () => adjustSheetHp(sheet, 1));
    if (isBoreal) {
      card.querySelector(".btn-res-minus")?.addEventListener("click", () => adjustSheetRes(sheet, -1));
      card.querySelector(".btn-res-plus")?.addEventListener("click", () => adjustSheetRes(sheet, 1));
    }
    card.querySelector(".btn-add-to-init").addEventListener("click", () => {
      addCombatantToInitiative({
        name: sheet.name,
        type: "player",
        currentHp: hpCur,
        maxHp: hpMax
      });
    });

    gmVitalsGrid.appendChild(card);
  });
}

async function adjustSheetHp(sheet, delta) {
  const hpMax = sheet.hpMax ?? sheet.maxHp ?? 10;
  const hpCur = sheet.hpCurrent ?? sheet.currentHp ?? hpMax;
  const newHp = Math.max(0, Math.min(hpMax, hpCur + delta));
  try {
    sheet.hpCurrent = newHp;
    sheet.currentHp = newHp;
    renderGmVitalsHud();

    await updateDoc(doc(db, "campaigns", activeCampaign.id, "sheets", sheet.id), {
      hpCurrent: newHp,
      currentHp: newHp
    });
  } catch (err) {
    console.warn("Erro ao ajustar HP:", err);
  }
}

async function adjustSheetRes(sheet, delta) {
  const resMax = sheet.resMax ?? 10;
  const resCur = sheet.resCurrent ?? resMax;
  const newRes = Math.max(0, Math.min(resMax, resCur + delta));
  try {
    sheet.resCurrent = newRes;
    renderGmVitalsHud();

    await updateDoc(doc(db, "campaigns", activeCampaign.id, "sheets", sheet.id), {
      resCurrent: newRes
    });
  } catch (err) {
    console.warn("Erro ao ajustar Resiliência:", err);
  }
}

// ==========================================================================
// NPCS E MONSTROS (COM VITALS, RESILIÊNCIA, DEFESAS, ATRIBUTOS E PERÍCIAS)
// ==========================================================================
const BOREAL_SKILLS_LIST = [
  "Atletismo", "Fortitude", "Luta", "Furtividade", "Ladinagem", "Pontaria",
  "Mística", "Ocultismo", "Canalização", "Percepção", "Intuição", "Investigação",
  "Adestramento", "Medicina", "Sobrevivência", "Diplomacia", "Enganação", "Intimidação", "Vontade"
];

let currentViewingNpcForSkills = null;

function populateNpcSkillsPicker(selectedSkills = []) {
  const container = document.getElementById("npcSkillsPickerGrid");
  if (!container) return;
  container.innerHTML = "";

  const selectedSet = new Set(selectedSkills);
  BOREAL_SKILLS_LIST.forEach((sk) => {
    const pill = document.createElement("div");
    pill.className = `npc-skill-pill ${selectedSet.has(sk) ? "selected" : ""}`;
    pill.textContent = sk;
    pill.dataset.skill = sk;
    pill.addEventListener("click", () => {
      pill.classList.toggle("selected");
    });
    container.appendChild(pill);
  });
}

function listenNpcs(campaignId) {
  const q = query(
    collection(db, "campaigns", campaignId, "npcs"),
    orderBy("createdAt", "desc")
  );

  unsubNpcs = onSnapshot(q, (snapshot) => {
    campaignNpcsCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderNpcs();
  }, (err) => {
    console.warn("Aviso ao escutar NPCs:", err);
  });
}

function renderNpcs() {
  if (!npcsGrid) return;
  npcsGrid.innerHTML = "";

  if (campaignNpcsCache.length === 0) {
    npcsGrid.innerHTML = `<p style="color: var(--text-muted); font-size: 0.88rem;">Nenhum NPC ou monstro rápido criado ainda.</p>`;
    return;
  }

  campaignNpcsCache.forEach((npc) => {
    const card = document.createElement("div");
    card.className = "gm-vital-card";

    const hpMax = npc.maxHp || 15;
    const hpCur = npc.currentHp !== undefined ? npc.currentHp : hpMax;
    const hpPercent = hpMax > 0 ? Math.max(0, Math.min(100, Math.round((hpCur / hpMax) * 100))) : 100;

    const resMax = npc.maxRes !== undefined ? npc.maxRes : 10;
    const resCur = npc.currentRes !== undefined ? npc.currentRes : resMax;
    const resPercent = resMax > 0 ? Math.max(0, Math.min(100, Math.round((resCur / resMax) * 100))) : 100;

    const defPadrao = npc.defPadrao !== undefined ? npc.defPadrao : (npc.ac || 10);
    const defMagica = npc.defMagica !== undefined ? npc.defMagica : 10;

    const skillsCount = Array.isArray(npc.skills) ? npc.skills.length : 0;
    const avatarUrl = npc.avatarUrl || "";
    let avatarHtml = `<div class="user-avatar" style="width: 36px; height: 36px; min-width: 36px; border-radius: 50%; background: rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; border: 1px solid var(--glass-border);">👾</div>`;
    if (avatarUrl) {
      avatarHtml = `<img src="${escapeHtml(avatarUrl)}" class="gm-vital-avatar" alt="${escapeHtml(npc.name)}" onerror="this.style.display='none'">`;
    }

    card.innerHTML = `
      <div class="gm-vital-card-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          ${avatarHtml}
          <div>
            <strong style="font-size: 0.95rem;">${escapeHtml(npc.name)}</strong>
            <div style="font-size: 0.74rem; color: var(--text-muted);">${escapeHtml(npc.npcType || "Inimigo")}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <button type="button" class="btn btn-ghost btn-xs btn-npc-edit" title="Editar NPC" style="padding: 2px 6px;">✏️</button>
          <button type="button" class="btn btn-ghost btn-xs btn-npc-del" title="Excluir NPC" style="padding: 2px 6px; color: var(--color-error);">✕</button>
        </div>
      </div>

      <!-- Barra de Vida -->
      <div>
        <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 4px;">
          <span>❤️ Vida</span>
          <strong class="vital-hp">${hpCur}/${hpMax}</strong>
        </div>
        <div class="hp-bar-container">
          <div class="hp-bar-fill" style="width: ${hpPercent}%;"></div>
        </div>
      </div>

      <!-- Barra de Resiliência -->
      <div>
        <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 4px;">
          <span style="color: #60a5fa;">🧠 Resiliência</span>
          <strong style="color: #60a5fa;">${resCur}/${resMax}</strong>
        </div>
        <div class="res-bar-container">
          <div class="res-bar-fill" style="width: ${resPercent}%;"></div>
        </div>
      </div>

      <!-- Defesas e Atributos -->
      <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); font-size: 0.75rem;">
        <div style="display: flex; gap: 8px;">
          <span title="Defesa Padrão">🛡️ <strong>${defPadrao}</strong></span>
          <span title="Defesa Mágica">🔮 <strong>${defMagica}</strong></span>
        </div>
        <div style="color: var(--text-muted); font-size: 0.72rem;">
          COR <strong>${npc.attrCorpo ?? 0}</strong> | POD <strong>${npc.attrPoder ?? 0}</strong> | MEN <strong>${npc.attrMente ?? 0}</strong>
        </div>
      </div>

      ${npc.notes ? `<p style="font-size: 0.78rem; color: var(--text-muted); font-style: italic; margin: 0;">${escapeHtml(npc.notes)}</p>` : ""}

      <!-- Controles de HP/Res e Ações -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; border-top: 1px dashed var(--glass-border); padding-top: 6px;">
        <div style="display: flex; gap: 6px; align-items: center;">
          <div class="gm-hp-controls" title="Ajustar Vida">
            <span style="font-size: 0.72rem; color: var(--text-muted);">HP:</span>
            <button type="button" class="btn-vital-step btn-npc-hp-minus">-1</button>
            <button type="button" class="btn-vital-step btn-npc-hp-plus">+1</button>
          </div>
          <div class="gm-hp-controls" title="Ajustar Resiliência">
            <span style="font-size: 0.72rem; color: var(--text-muted);">Res:</span>
            <button type="button" class="btn-vital-step btn-npc-res-minus">-1</button>
            <button type="button" class="btn-vital-step btn-npc-res-plus">+1</button>
          </div>
        </div>
        <div style="display: flex; gap: 4px;">
          <button type="button" class="btn btn-ghost btn-xs btn-npc-skills" style="padding: 3px 6px; font-size: 0.72rem;">📜 Perícias (${skillsCount})</button>
          <button type="button" class="btn btn-ghost btn-xs btn-npc-init" style="padding: 3px 6px; font-size: 0.72rem;">+ Combate</button>
        </div>
      </div>
    `;

    card.querySelector(".btn-npc-hp-minus").addEventListener("click", () => adjustNpcHp(npc, -1));
    card.querySelector(".btn-npc-hp-plus").addEventListener("click", () => adjustNpcHp(npc, 1));
    card.querySelector(".btn-npc-res-minus").addEventListener("click", () => adjustNpcRes(npc, -1));
    card.querySelector(".btn-npc-res-plus").addEventListener("click", () => adjustNpcRes(npc, 1));

    card.querySelector(".btn-npc-skills").addEventListener("click", () => openNpcSkillsView(npc));
    card.querySelector(".btn-npc-edit").addEventListener("click", () => openEditNpcModal(npc));

    card.querySelector(".btn-npc-init").addEventListener("click", () => {
      addCombatantToInitiative({
        name: npc.name,
        type: "npc",
        currentHp: hpCur,
        maxHp: hpMax
      });
    });

    card.querySelector(".btn-npc-del").addEventListener("click", async () => {
      if (confirm(`Excluir NPC "${npc.name}"?`)) {
        await deleteDoc(doc(db, "campaigns", activeCampaign.id, "npcs", npc.id));
      }
    });

    npcsGrid.appendChild(card);
  });
}

async function adjustNpcHp(npc, delta) {
  const hpMax = npc.maxHp || 15;
  const hpCur = npc.currentHp !== undefined ? npc.currentHp : hpMax;
  const newHp = Math.max(0, Math.min(hpMax, hpCur + delta));
  npc.currentHp = newHp;
  renderNpcs();
  try {
    await updateDoc(doc(db, "campaigns", activeCampaign.id, "npcs", npc.id), {
      currentHp: newHp
    });
  } catch (err) {
    console.warn("Erro ao ajustar HP do NPC:", err);
  }
}

async function adjustNpcRes(npc, delta) {
  const resMax = npc.maxRes !== undefined ? npc.maxRes : 10;
  const resCur = npc.currentRes !== undefined ? npc.currentRes : resMax;
  const newRes = Math.max(0, Math.min(resMax, resCur + delta));
  npc.currentRes = newRes;
  renderNpcs();
  try {
    await updateDoc(doc(db, "campaigns", activeCampaign.id, "npcs", npc.id), {
      currentRes: newRes
    });
  } catch (err) {
    console.warn("Erro ao ajustar Resiliência do NPC:", err);
  }
}

// Modal Ver / Gerenciar Perícias do NPC
function openNpcSkillsView(npc) {
  currentViewingNpcForSkills = npc;
  const title = document.getElementById("npcSkillsModalTitle");
  if (title) title.textContent = `Perícias de ${npc.name}`;

  renderNpcActiveSkillsList();
  populateAddSkillDropdown();
  openModalById("modalNpcSkillsView");
}

function renderNpcActiveSkillsList() {
  const list = document.getElementById("npcActiveSkillsList");
  if (!list || !currentViewingNpcForSkills) return;
  list.innerHTML = "";

  const skills = Array.isArray(currentViewingNpcForSkills.skills) ? currentViewingNpcForSkills.skills : [];
  if (skills.length === 0) {
    list.innerHTML = `<span style="font-size: 0.78rem; color: var(--text-muted); font-style: italic;">Nenhuma perícia cadastrada neste NPC.</span>`;
    return;
  }

  skills.forEach((sk) => {
    const badge = document.createElement("span");
    badge.className = "npc-active-badge";
    badge.innerHTML = `
      <span>${escapeHtml(sk)}</span>
      <span class="btn-remove-skill-tag" title="Remover perícia">&times;</span>
    `;
    badge.querySelector(".btn-remove-skill-tag").addEventListener("click", async () => {
      currentViewingNpcForSkills.skills = currentViewingNpcForSkills.skills.filter((s) => s !== sk);
      renderNpcActiveSkillsList();
      populateAddSkillDropdown();
      renderNpcs();
      try {
        await updateDoc(doc(db, "campaigns", activeCampaign.id, "npcs", currentViewingNpcForSkills.id), {
          skills: currentViewingNpcForSkills.skills
        });
      } catch (err) {
        console.error("Erro ao salvar remoção de perícia:", err);
      }
    });
    list.appendChild(badge);
  });
}

function populateAddSkillDropdown() {
  const select = document.getElementById("selectAddNpcSkill");
  if (!select || !currentViewingNpcForSkills) return;
  select.innerHTML = `<option value="">Selecione uma perícia...</option>`;

  const activeSkills = new Set(currentViewingNpcForSkills.skills || []);
  BOREAL_SKILLS_LIST.forEach((sk) => {
    if (!activeSkills.has(sk)) {
      const opt = document.createElement("option");
      opt.value = sk;
      opt.textContent = sk;
      select.appendChild(opt);
    }
  });
}

const btnAddNpcSkillDirect = document.getElementById("btnAddNpcSkillDirect");
if (btnAddNpcSkillDirect) {
  btnAddNpcSkillDirect.addEventListener("click", async () => {
    if (!currentViewingNpcForSkills) return;
    const select = document.getElementById("selectAddNpcSkill");
    const chosen = select ? select.value : "";
    if (!chosen) return;

    currentViewingNpcForSkills.skills = currentViewingNpcForSkills.skills || [];
    if (!currentViewingNpcForSkills.skills.includes(chosen)) {
      currentViewingNpcForSkills.skills.push(chosen);
    }

    renderNpcActiveSkillsList();
    populateAddSkillDropdown();
    renderNpcs();

    try {
      await updateDoc(doc(db, "campaigns", activeCampaign.id, "npcs", currentViewingNpcForSkills.id), {
        skills: currentViewingNpcForSkills.skills
      });
      showToast(`Perícia "${chosen}" adicionada!`, "success");
    } catch (err) {
      console.error("Erro ao adicionar perícia ao NPC:", err);
    }
  });
}

// Modal Criar / Editar NPC
function openCreateNpcModal() {
  const form = document.getElementById("formCreateNPC");
  if (form) form.reset();
  setInputValue("npcEditId", "");
  setInputValue("npcAvatarUrl", "");
  const preview = document.getElementById("npcAvatarPreview");
  if (preview) preview.innerHTML = "👾";
  const title = document.getElementById("modalCreateNPCTitle");
  if (title) title.textContent = "Novo NPC ou Monstro";

  populateNpcSkillsPicker([]);
  openModalById("modalCreateNPC");
}

function openEditNpcModal(npc) {
  setInputValue("npcEditId", npc.id);
  setInputValue("npcName", npc.name || "");
  setInputValue("npcType", npc.npcType || "Inimigo");
  setInputValue("npcMaxHp", npc.maxHp || 15);
  setInputValue("npcMaxRes", npc.maxRes !== undefined ? npc.maxRes : 10);
  setInputValue("npcDefPadrao", npc.defPadrao !== undefined ? npc.defPadrao : (npc.ac || 10));
  setInputValue("npcDefMagica", npc.defMagica !== undefined ? npc.defMagica : 10);
  setInputValue("npcAttrCorpo", npc.attrCorpo || 0);
  setInputValue("npcAttrPoder", npc.attrPoder || 0);
  setInputValue("npcAttrMente", npc.attrMente || 0);
  setInputValue("npcNotes", npc.notes || "");
  setInputValue("npcAvatarUrl", npc.avatarUrl || "");

  const preview = document.getElementById("npcAvatarPreview");
  if (preview) {
    if (npc.avatarUrl) {
      preview.innerHTML = `<img src="${escapeHtml(npc.avatarUrl)}" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else {
      preview.innerHTML = "👾";
    }
  }

  const title = document.getElementById("modalCreateNPCTitle");
  if (title) title.textContent = `Editar ${npc.name}`;

  populateNpcSkillsPicker(npc.skills || []);
  openModalById("modalCreateNPC");
}

if (btnOpenCreateNPC) {
  btnOpenCreateNPC.addEventListener("click", openCreateNpcModal);
}

if (formCreateNPC) {
  formCreateNPC.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeCampaign) return;

    const editId = document.getElementById("npcEditId")?.value.trim();
    const name = document.getElementById("npcName")?.value.trim();
    const npcType = document.getElementById("npcType")?.value;
    const maxHp = parseInt(document.getElementById("npcMaxHp")?.value, 10) || 15;
    const maxRes = parseInt(document.getElementById("npcMaxRes")?.value, 10) || 10;
    const defPadrao = parseInt(document.getElementById("npcDefPadrao")?.value, 10) || 10;
    const defMagica = parseInt(document.getElementById("npcDefMagica")?.value, 10) || 10;
    const attrCorpo = parseInt(document.getElementById("npcAttrCorpo")?.value, 10) || 0;
    const attrPoder = parseInt(document.getElementById("npcAttrPoder")?.value, 10) || 0;
    const attrMente = parseInt(document.getElementById("npcAttrMente")?.value, 10) || 0;
    const notes = document.getElementById("npcNotes")?.value.trim() || "";
    const avatarUrl = document.getElementById("npcAvatarUrl")?.value.trim() || "";

    if (!name) {
      showToast("Por favor, digite o nome do NPC.", "error");
      return;
    }

    // Coleta perícias selecionadas
    const selectedSkills = [];
    document.querySelectorAll("#npcSkillsPickerGrid .npc-skill-pill.selected").forEach((p) => {
      if (p.dataset.skill) selectedSkills.push(p.dataset.skill);
    });

    try {
      const btnSubmit = document.getElementById("btnSubmitNpcForm");
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = "Salvando...";
      }

      const npcPayload = {
        name,
        npcType,
        maxHp,
        maxRes,
        defPadrao,
        ac: defPadrao,
        defMagica,
        attrCorpo,
        attrPoder,
        attrMente,
        skills: selectedSkills,
        notes,
        avatarUrl,
        updatedAt: serverTimestamp()
      };

      if (editId) {
        // Atualiza NPC existente mantendo HP/Res atuais dentro dos novos limites
        const existing = campaignNpcsCache.find((n) => n.id === editId);
        if (existing) {
          npcPayload.currentHp = Math.min(existing.currentHp ?? maxHp, maxHp);
          npcPayload.currentRes = Math.min(existing.currentRes ?? maxRes, maxRes);
        }
        await updateDoc(doc(db, "campaigns", activeCampaign.id, "npcs", editId), npcPayload);
        showToast(`NPC "${name}" atualizado com sucesso!`, "success");
      } else {
        // Cria novo NPC
        npcPayload.currentHp = maxHp;
        npcPayload.currentRes = maxRes;
        npcPayload.createdAt = serverTimestamp();
        await addDoc(collection(db, "campaigns", activeCampaign.id, "npcs"), npcPayload);
        showToast("NPC registrado no grimório!", "success");
      }

      closeModalById("modalCreateNPC");
      formCreateNPC.reset();
    } catch (err) {
      console.error("Erro ao salvar NPC:", err);
      showToast("Erro ao salvar NPC: " + err.message, "error");
    } finally {
      const btnSubmit = document.getElementById("btnSubmitNpcForm");
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Salvar NPC";
      }
    }
  });
}

// Gerenciador de Iniciativa
function renderInitiative() {
  if (!initiativeItemsList) return;
  initiativeItemsList.innerHTML = "";

  if (initiativeList.length === 0) {
    initiativeItemsList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.88rem; text-align: center; padding: 14px;">Nenhum participante adicionado ao combate.</p>`;
    if (currentTurnBadge) currentTurnBadge.textContent = "Combate parado";
    return;
  }

  // Ordena por iniciativa decrescente
  initiativeList.sort((a, b) => b.score - a.score);

  if (currentTurnBadge) {
    const active = initiativeList[currentTurnIndex];
    currentTurnBadge.textContent = active ? `Turno de: ${active.name}` : "Turno";
  }

  initiativeList.forEach((c, idx) => {
    const isCurrent = idx === currentTurnIndex;
    const item = document.createElement("div");
    item.className = `initiative-item ${isCurrent ? "current-turn" : ""}`;

    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span class="initiative-score-badge">${c.score}</span>
        <div>
          <strong>${escapeHtml(c.name)}</strong>
          <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 6px;">(${c.type === "player" ? "Jogador" : "NPC"})</span>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 10px;">
        <button type="button" class="btn btn-ghost btn-init-del" style="padding: 2px 6px; font-size: 0.8rem; color: var(--color-error);">&times;</button>
      </div>
    `;

    item.querySelector(".btn-init-del").addEventListener("click", () => {
      initiativeList.splice(idx, 1);
      if (currentTurnIndex >= initiativeList.length) currentTurnIndex = 0;
      renderInitiative();
    });

    initiativeItemsList.appendChild(item);
  });
}

function addCombatantToInitiative(data) {
  const score = Math.floor(Math.random() * 20) + 1; // Rola d20 automático inicial
  initiativeList.push({
    id: "init_" + Date.now() + Math.random(),
    name: data.name,
    type: data.type || "npc",
    score: data.score || score
  });
  renderInitiative();
  showToast(`"${data.name}" adicionado à iniciativa com ${score}!`, "info");
}

if (btnRollAllInitiatives) {
  btnRollAllInitiatives.addEventListener("click", () => {
    initiativeList.forEach((c) => {
      c.score = Math.floor(Math.random() * 20) + 1;
    });
    currentTurnIndex = 0;
    renderInitiative();
    showToast("Iniciativas roladas com sucesso!", "success");
  });
}

if (btnNextTurn) {
  btnNextTurn.addEventListener("click", () => {
    if (initiativeList.length === 0) return;
    currentTurnIndex = (currentTurnIndex + 1) % initiativeList.length;
    renderInitiative();
  });
}

if (btnPrevTurn) {
  btnPrevTurn.addEventListener("click", () => {
    if (initiativeList.length === 0) return;
    currentTurnIndex = (currentTurnIndex - 1 + initiativeList.length) % initiativeList.length;
    renderInitiative();
  });
}

if (btnClearInitiative) {
  btnClearInitiative.addEventListener("click", () => {
    initiativeList = [];
    currentTurnIndex = 0;
    renderInitiative();
  });
}

if (btnAddCombatant) {
  btnAddCombatant.addEventListener("click", () => openModalById("modalAddCombatant"));
}

if (formAddCombatant) {
  formAddCombatant.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("combatantName").value.trim();
    const manualScore = parseInt(document.getElementById("combatantScore").value, 10);
    const score = isNaN(manualScore) ? (Math.floor(Math.random() * 20) + 1) : manualScore;

    if (!name) return;
    addCombatantToInitiative({ name, score, type: "npc" });
    closeModalById("modalAddCombatant");
    formAddCombatant.reset();
  });
}

// ==========================================================================
// 8. ABA 4: COMPENDIUM
// ==========================================================================
function listenCompendium(campaignId) {
  const q = query(
    collection(db, "campaigns", campaignId, "compendium"),
    orderBy("createdAt", "desc")
  );

  unsubCompendium = onSnapshot(q, (snapshot) => {
    campaignCompendiumCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderCompendium();
  }, (err) => {
    console.warn("Aviso ao escutar compendium:", err);
  });
}

function renderCompendium() {
  if (!compendiumGrid) return;
  compendiumGrid.innerHTML = "";

  const term = (compendiumSearch ? compendiumSearch.value : "").trim().toLowerCase();

  const filtered = campaignCompendiumCache.filter((item) => {
    const matchFilter = currentCompendiumFilter === "todos" || item.category === currentCompendiumFilter;
    const matchTerm = !term || item.title.toLowerCase().includes(term) || (item.description || "").toLowerCase().includes(term);
    return matchFilter && matchTerm;
  });

  if (filtered.length === 0) {
    compendiumGrid.innerHTML = `
      <div class="empty-campaigns glass-panel" style="grid-column: 1 / -1; padding: 32px 20px;">
        <p style="color: var(--text-muted); font-size: 0.9rem;">Nenhum registro encontrado no Compendium.</p>
      </div>
    `;
    return;
  }

  filtered.forEach((item) => {
    const card = document.createElement("div");
    card.className = "compendium-card";

    card.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span class="comp-tag">${escapeHtml(item.category)}</span>
          ${isMasterUser ? `
            <button type="button" class="btn btn-ghost btn-comp-del" style="padding: 2px 6px; font-size: 0.75rem; color: var(--color-error);">&times;</button>
          ` : ""}
        </div>
        <h4 style="font-family: var(--font-heading); font-size: 1.15rem; margin-bottom: 6px;">${escapeHtml(item.title)}</h4>
        ${item.properties ? `<p style="font-size: 0.8rem; color: var(--accent-primary); margin-bottom: 6px; font-weight: 600;">${escapeHtml(item.properties)}</p>` : ""}
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.45;">${escapeHtml(item.description || "")}</p>
      </div>
    `;

    if (isMasterUser) {
      card.querySelector(".btn-comp-del").addEventListener("click", async () => {
        if (confirm(`Excluir "${item.title}" do compendium?`)) {
          await deleteDoc(doc(db, "campaigns", activeCampaign.id, "compendium", item.id));
        }
      });
    }

    compendiumGrid.appendChild(card);
  });
}

// Filtros do Compendium
compendiumFilters.forEach((pill) => {
  pill.addEventListener("click", () => {
    compendiumFilters.forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    currentCompendiumFilter = pill.getAttribute("data-filter") || "todos";
    renderCompendium();
  });
});

let compSearchTimeout = null;
if (compendiumSearch) {
  compendiumSearch.addEventListener("input", () => {
    clearTimeout(compSearchTimeout);
    compSearchTimeout = setTimeout(() => {
      renderCompendium();
    }, 180);
  });
}

if (btnOpenCreateCompendium) {
  btnOpenCreateCompendium.addEventListener("click", () => openModalById("modalCreateCompendium"));
}

if (formCreateCompendium) {
  formCreateCompendium.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeCampaign) return;

    const category = document.getElementById("compCategory").value;
    const title = document.getElementById("compTitle").value.trim();
    const properties = document.getElementById("compProperties").value.trim();
    const description = document.getElementById("compDescription").value.trim();

    if (!title) return;

    try {
      await addDoc(collection(db, "campaigns", activeCampaign.id, "compendium"), {
        category,
        title,
        properties,
        description,
        createdAt: serverTimestamp()
      });

      closeModalById("modalCreateCompendium");
      formCreateCompendium.reset();
      showToast("Registro adicionado ao Compendium!", "success");
    } catch (err) {
      console.error("Erro ao salvar compendium:", err);
      showToast("Erro ao adicionar registro.", "error");
    }
  });
}

// ==========================================================================
// 9. ABA 5: CONFIGURAÇÕES E DUPLICAÇÃO DA CAMPANHA
// ==========================================================================
function populateCampaignSettings(campaign) {
  if (campSettingsName) campSettingsName.value = campaign.name || "";
  if (campSettingsCover) campSettingsCover.value = campaign.coverUrl || "";
  if (campSettingsSystemA && campSettingsSystemB) {
    if (campaign.system === "Sistema B") {
      campSettingsSystemB.checked = true;
    } else {
      campSettingsSystemA.checked = true;
    }
  }
}

if (formCampaignSettings) {
  formCampaignSettings.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeCampaign || !isMasterUser) return;

    const name = campSettingsName.value.trim();
    const coverUrl = campSettingsCover.value.trim();
    const system = campSettingsSystemB.checked ? "Sistema B" : "Escória de Deus RPG";

    if (!name) return;

    try {
      await updateDoc(doc(db, "campaigns", activeCampaign.id), {
        name,
        coverUrl,
        system
      });

      showToast("Configurações da campanha atualizadas!", "success");
    } catch (err) {
      console.error("Erro ao atualizar configurações:", err);
      showToast("Erro ao atualizar campanha.", "error");
    }
  });
}

// Upload de nova capa da campanha a partir do dispositivo
if (btnUploadCampSettingsCover && campSettingsCoverFileInput) {
  btnUploadCampSettingsCover.addEventListener("click", () => {
    campSettingsCoverFileInput.value = "";
    campSettingsCoverFileInput.click();
  });

  campSettingsCoverFileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      openCoverCropper(file, async (dataUrl) => {
        if (campSettingsCover) {
          campSettingsCover.value = dataUrl;
        }
        if (detailCoverImg) {
          detailCoverImg.src = dataUrl;
        }
        if (activeCampaign && isMasterUser) {
          try {
            await updateDoc(doc(db, "campaigns", activeCampaign.id), {
              coverUrl: dataUrl
            });
            showToast("Nova capa da campanha salva com sucesso!", "success");
          } catch (err) {
            console.error("Erro ao salvar capa no Firestore:", err);
            showToast("Não foi possível salvar a capa.", "error");
          }
        }
      });
    }
  });
}

// Modal Duplicar Campanha
if (btnOpenDuplicate) {
  btnOpenDuplicate.addEventListener("click", () => {
    if (duplicateCampaignName && activeCampaign) {
      duplicateCampaignName.value = `Cópia de ${activeCampaign.name}`;
    }
    openModalById("modalDuplicateCampaign");
  });
}

if (formDuplicateCampaign) {
  formDuplicateCampaign.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeCampaign || !currentAuthUser) return;

    const newName = duplicateCampaignName.value.trim();
    const copyComp = document.getElementById("dupCopyCompendium").checked;
    const copyGMScreen = document.getElementById("dupCopyGMScreen").checked;
    const copyPlayers = document.getElementById("dupCopyPlayers").checked;

    if (!newName) return;

    try {
      const btn = document.getElementById("btnSubmitDuplicate");
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="btn-spinner"></span> <span>Duplicando...</span>`;
      }

      // Gera código de convite novo
      const newCode = "VEU" + Math.random().toString(36).substring(2, 5).toUpperCase();

      // 1. Cria nova campanha
      const newCampaignDoc = await addDoc(collection(db, "campaigns"), {
        name: newName,
        system: activeCampaign.system || "Escória de Deus RPG",
        coverUrl: activeCampaign.coverUrl || "",
        inviteCode: newCode,
        masterId: currentAuthUser.uid,
        masterName: currentAuthUser.displayName || currentAuthUser.email.split("@")[0],
        masterEmail: currentAuthUser.email,
        players: [currentAuthUser.uid],
        playerDetails: [
          {
            uid: currentAuthUser.uid,
            name: currentAuthUser.displayName || currentAuthUser.email.split("@")[0],
            email: currentAuthUser.email,
            role: "master",
            joinedAt: new Date().toISOString()
          }
        ],
        createdAt: serverTimestamp()
      });

      // 2. Copia Compendium se selecionado
      if (copyComp) {
        const compSnap = await getDocs(collection(db, "campaigns", activeCampaign.id, "compendium"));
        for (const d of compSnap.docs) {
          const data = d.data();
          await addDoc(collection(db, "campaigns", newCampaignDoc.id, "compendium"), {
            ...data,
            createdAt: serverTimestamp()
          });
        }
      }

      // 3. Copia NPCs do Escudo do Mestre se selecionado
      if (copyGMScreen) {
        const npcsSnap = await getDocs(collection(db, "campaigns", activeCampaign.id, "npcs"));
        for (const d of npcsSnap.docs) {
          const data = d.data();
          await addDoc(collection(db, "campaigns", newCampaignDoc.id, "npcs"), {
            ...data,
            createdAt: serverTimestamp()
          });
        }
      }

      // 4. Copia Fichas se selecionado
      if (copyPlayers) {
        const sheetsSnap = await getDocs(collection(db, "campaigns", activeCampaign.id, "sheets"));
        for (const d of sheetsSnap.docs) {
          const data = d.data();
          await addDoc(collection(db, "campaigns", newCampaignDoc.id, "sheets"), {
            ...data,
            createdAt: serverTimestamp()
          });
        }
      }

      closeModalById("modalDuplicateCampaign");
      showToast(`Campanha duplicada com sucesso! Código: ${newCode}`, "success");
    } catch (err) {
      console.error("Erro ao duplicar campanha:", err);
      showToast("Não foi possível duplicar a campanha.", "error");
    } finally {
      const btn = document.getElementById("btnSubmitDuplicate");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>Duplicar Campanha</span>`;
      }
    }
  });
}

// Modal Excluir Campanha (Dupla Confirmação)
if (btnOpenDeleteCampaign) {
  btnOpenDeleteCampaign.addEventListener("click", () => {
    if (confirmCampaignNameInput) confirmCampaignNameInput.value = "";
    const targetLabel = document.getElementById("deleteCampTargetName");
    if (targetLabel && activeCampaign) targetLabel.textContent = activeCampaign.name;
    openModalById("modalDeleteCampaign");
  });
}

if (formDeleteCampaign) {
  formDeleteCampaign.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeCampaign || !isMasterUser) return;

    const typedName = confirmCampaignNameInput.value.trim();
    if (typedName !== activeCampaign.name) {
      showToast("O nome digitado não corresponde ao nome da campanha.", "error");
      return;
    }

    try {
      await deleteDoc(doc(db, "campaigns", activeCampaign.id));
      closeModalById("modalDeleteCampaign");
      cleanupCampaignListeners();
      showToast("A campanha foi excluída permanentemente.", "info");

      // Volta para a lista de campanhas
      const btnBack = document.getElementById("btnBackToCampaigns");
      if (btnBack) btnBack.click();
    } catch (err) {
      console.error("Erro ao excluir campanha:", err);
      showToast("Erro ao excluir campanha.", "error");
    }
  });
}

// ==========================================================================
// 10. HELPERS
// ==========================================================================
function openModalById(id) {
  let modal = document.getElementById(id);
  if (!modal) {
    if (id === "modalCreateSheet") modal = document.getElementById("modal-ficha");
    if (id === "modal-ficha") modal = document.getElementById("modalCreateSheet");
  }
  if (modal) modal.classList.add("active");
}

function closeModalById(id) {
  let modal = document.getElementById(id);
  if (!modal) {
    if (id === "modalCreateSheet") modal = document.getElementById("modal-ficha");
    if (id === "modal-ficha") modal = document.getElementById("modalCreateSheet");
  }
  if (modal) modal.classList.remove("active");
}

function showToast(msg, type = "info") {
  const alertEl = document.getElementById("dashboardAlert");
  if (!alertEl) return;
  alertEl.className = `alert alert-${type}`;
  alertEl.innerHTML = `<span>${msg}</span>`;
  alertEl.style.display = "flex";
  setTimeout(() => { alertEl.style.display = "none"; }, 3500);
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================================================
// 19. SISTEMA BOREAL RPG: DADOS, CÁLCULOS, SLOTS, ESPÍRITO & DRAWER
// ==========================================================================

const BOREAL_SKILLS_COL_A = [
  "Animais", "Armas", "Arte", "Carisma", "Controle",
  "Cozinhar", "Emitir", "Fortitude", "Furtividade", "História"
];

const BOREAL_SKILLS_COL_B = [
  "Influência", "Lábia", "Luta", "Máquinas", "Medicina",
  "Mística", "Oratória", "Percepção", "Sobrevivência", "Vontade"
];

const BOREAL_ALL_SKILLS = [...BOREAL_SKILLS_COL_A, ...BOREAL_SKILLS_COL_B];

const BOREAL_SPIRITS_DATA = {
  "Sabedoria": {
    funcoes: ["Aprender", "Empoderar", "Inventar", "Revelar", "Absorver"],
    caracteristicas: ["Armas", "Dimensional", "Idioma", "Ilusão", "Magia"],
    pericias: ["História", "Lábia", "Influência", "Oratória", "Percepção"],
    especialidades: ["Memória", "Idiomas", "Intuição", "Arte", "Música", "História", "Persuasão", "Análise", "Construção"]
  },
  "Emocionais": {
    funcoes: ["Alterar", "Controlar", "Restaurar", "Transmitir", "Cativar"],
    caracteristicas: ["Confiança", "Desespero", "Emoção", "Ilusão", "Loucura"],
    pericias: ["Carisma", "Controle", "Lábia", "Influência", "Vontade"],
    especialidades: ["Amor", "Tristeza", "Raiva", "Inveja", "Temor", "Loucura", "Desejo", "Culpa", "Calmaria"]
  },
  "Profética": {
    funcoes: ["Alterar", "Prever", "Revelar", "Praguejar", "Transmitir"],
    caracteristicas: ["Emoção", "Futuro", "Loucura", "Movimento", "Visão"],
    pericias: ["Emitir", "História", "Influência", "Oratória", "Percepção"],
    especialidades: ["Futuro", "Presente", "Passado", "Oráculo", "Maldição", "Realidade", "Sonhos", "Linguagem", "Discórdia"]
  },
  "Conexão": {
    funcoes: ["Banir", "Juntar/Conectar", "Restaurar", "Transmitir", "Cativar"],
    caracteristicas: ["Corpo", "Emoção", "Idioma", "Sangue", "Visão"],
    pericias: ["Animais", "Controle", "Fortitude", "Mística", "Oratória"],
    especialidades: ["Intenção", "Fauna", "Flora", "Confiança", "Telepatia", "Imaginação", "Fusão", "Carisma", "Esperança"]
  },
  "Elemental": {
    funcoes: ["Atacar/Ferir", "Atrair/Repelir", "Controlar", "Invocar/Criar", "Transmitir"],
    caracteristicas: ["Água", "Ar", "Elétrico", "Fogo", "Terra"],
    pericias: ["Controle", "Emitir", "Luta", "Mística", "Vontade"],
    especialidades: ["Água", "Ametais", "Ar", "Elétrico", "Fogo", "Gases", "Gelo", "Metais", "Terra"]
  },
  "Manipulação": {
    funcoes: ["Aprisionar", "Atrair/Repelir", "Cativar", "Controlar", "Invocar/Criar"],
    caracteristicas: ["Corpo", "Gravidade", "Ilusão", "Movimento", "Som"],
    pericias: ["Carisma", "Controle", "Fortitude", "Lábia", "Vontade"],
    especialidades: ["Corporal", "Gravitacional", "Ilusória", "Sonora", "Sanguínea", "Mental", "Temporal", "Material", "Necromancia"]
  },
  "Vitalidade": {
    funcoes: ["Alterar", "Destruir", "Enfraquecer", "Restaurar", "Absorver"],
    caracteristicas: ["Corpo", "Necrótico", "Nojento/Secreção", "Sangue", "Veneno"],
    pericias: ["Controle", "Fortitude", "Medicina", "Mística", "Vontade"],
    especialidades: ["Necromancia", "Pragas", "Doenças", "Chagas", "Sangue", "Veneno", "Cura", "Restauração", "Crescimento"]
  },
  "Físico": {
    funcoes: ["Atacar/Ferir", "Atrair/Repelir", "Juntar/Conectar", "Proteger", "Destruir"],
    caracteristicas: ["Corpo", "Força", "Movimento", "Velocidade", "Visão"],
    pericias: ["Controle", "Fortitude", "Luta", "Percepção", "Sobrevivência"],
    especialidades: ["Força", "Velocidade", "Visão", "Audição", "Resistência", "Voz", "Sentidos", "Energia", "Defesa"]
  }
};

const BOREAL_TARGETS_LIST = [
  "Abstrato (Ala)", "Alma (Ani)", "Animais (Ali)", "Aura (Iro)", "Cadáver (Eva)",
  "Clima (Ayu)", "Comida (Ibo)", "Construção (Omu)", "Elemento (Eli)", "Explosão (Epi)",
  "Inanimado (Exa)", "Informação (Azi)", "Mente/Pensamento (Imu)", "Pessoa (Ivi)",
  "Sentido (Una)", "Tecnologia (Ina)", "Tempo (Anu)", "Terreno (Era)", "Vegetação/Flora (Ora)"
];

let borealAutoSaveTimeout = null;

function triggerBorealAutoSave() {
  if (!currentViewingSheet || !activeCampaign) return;
  clearTimeout(borealAutoSaveTimeout);
  borealAutoSaveTimeout = setTimeout(() => {
    saveBorealSheet(true);
  }, 750);
}

// Compressão de Imagens via Canvas (< 100KB)
function compressImageFile(file, maxWidth = 400, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Abertura e Inicialização da Ficha Boreal RPG
function openBorealSheetModal(sheet) {
  currentViewingSheet = { ...sheet };

  const borealBox = document.getElementById("borealSheetBox");
  if (!borealBox) return;

  // Inicializa estrutura de dados se ausente
  currentViewingSheet.attributes = currentViewingSheet.attributes || { corpo: 0, poder: 0, mente: 0 };
  currentViewingSheet.skills = currentViewingSheet.skills || {};
  currentViewingSheet.classSkills = currentViewingSheet.classSkills || [];
  currentViewingSheet.potions = currentViewingSheet.potions || [];
  currentViewingSheet.amulets = currentViewingSheet.amulets || [];
  currentViewingSheet.backpack = currentViewingSheet.backpack || [];
  currentViewingSheet.equippedSlots = currentViewingSheet.equippedSlots || {
    cabeca: { name: "", prot: 0 },
    mao: { name: "", prot: 0 },
    corpo: { name: "", prot: 0 },
    pernas: { name: "", prot: 0 }
  };
  currentViewingSheet.spirit = currentViewingSheet.spirit || {
    nome: sheet.spiritName || "Espírito Guardião",
    tipo: sheet.spiritType || "Sabedoria",
    nivel: 1,
    avatarUrl: "",
    hpCurrent: 10,
    hpMax: 10,
    conexao: 0,
    protCurrent: 1,
    protMax: 1,
    dtFisico: 6,
    dtMagico: 6,
    dtMental: 6,
    attrCorpo: 1,
    attrPoder: 1,
    attrMente: 1,
    specialty: "",
    aparencia: "",
    personalidade: "",
    habitos: ""
  };

  // Inicializa Moedas (Rubi, Ouro, Prata, Bronze) com compatibilidade de ficha antiga
  if (!currentViewingSheet.currencies || typeof currentViewingSheet.currencies !== "object") {
    const legacyMoney = parseInt(currentViewingSheet.money, 10) || 0;
    currentViewingSheet.currencies = {
      rubi: 0,
      ouro: 0,
      prata: 0,
      bronze: legacyMoney
    };
  } else {
    currentViewingSheet.currencies = {
      rubi: Math.max(0, parseInt(currentViewingSheet.currencies.rubi, 10) || 0),
      ouro: Math.max(0, parseInt(currentViewingSheet.currencies.ouro, 10) || 0),
      prata: Math.max(0, parseInt(currentViewingSheet.currencies.prata, 10) || 0),
      bronze: Math.max(0, parseInt(currentViewingSheet.currencies.bronze, 10) || 0)
    };
  }

  // Preenche Cabeçalho Boreal
  setInputValue("borealCharName", currentViewingSheet.name || "Aventureiro");
  setInputValue("borealCharClass", currentViewingSheet.class || currentViewingSheet.characterClass || "Iniciado");
  setInputValue("borealSheetId", currentViewingSheet.id || "");
  setInputValue("borealCharLevel", currentViewingSheet.level || 1);
  setInputValue("borealCoinRubi", currentViewingSheet.currencies.rubi);
  setInputValue("borealCoinOuro", currentViewingSheet.currencies.ouro);
  setInputValue("borealCoinPrata", currentViewingSheet.currencies.prata);
  setInputValue("borealCoinBronze", currentViewingSheet.currencies.bronze);

  // Espírito no Topo
  const spiritSelect = document.getElementById("borealHeaderSpiritSelect");
  if (spiritSelect) {
    const spType = currentViewingSheet.spirit?.tipo || "Sabedoria";
    spiritSelect.value = BOREAL_SPIRITS_DATA[spType] ? spType : "Sabedoria";
  }

  // Preenche Identificação Básica Coluna 1 (Idade, Nível, Nome do Espírito)
  setInputValue("borealFieldAge", currentViewingSheet.age ?? "");
  setInputValue("borealFieldCharLevel", currentViewingSheet.level || 1);
  setInputValue("borealFieldSpirit", currentViewingSheet.spirit?.nome || "Espírito Guardião");

  // Cor de Destaque
  const accent = currentViewingSheet.accentColor || "#3b82f6";
  applyBorealAccent(accent);
  const accentPicker = document.getElementById("borealSheetAccentPicker");
  if (accentPicker) accentPicker.value = accent;

  // Foto do Personagem
  updateBorealPortraitDisplay(currentViewingSheet.avatarUrl || "");

  // Foto do Espírito
  updateSpiritPortraitDisplay(currentViewingSheet.spirit?.avatarUrl || "");

  // Atributos
  setInputValue("borealAttrCorpo", currentViewingSheet.attributes.corpo ?? 0);
  setInputValue("borealAttrPoder", currentViewingSheet.attributes.poder ?? 0);
  setInputValue("borealAttrMente", currentViewingSheet.attributes.mente ?? 0);

  // Renderiza Perícias
  renderBorealSkills();

  // Recalcula Vitais e DTs
  recalcBorealVitalsAndDT();

  // Renderiza Acordeões
  renderBorealClassSkills();
  renderBorealPotions();
  renderBorealAmulets();

  // Renderiza Equipamento e Mochila
  renderBorealEquippedSlots();
  renderBorealBackpack();

  // Popula Magia de acordo com o Espírito
  populateBorealMagicOptions();

  // Preenche Campos do Espírito Drawer
  populateSpiritDrawerFields();

  const bSheetBody = document.getElementById("borealSheetBody");
  if (bSheetBody) {
    if (!bSheetBody.getAttribute("data-active-view")) bSheetBody.setAttribute("data-active-view", "1-2");
    bSheetBody.setAttribute("data-active-mobile", "1");
  }
  document.querySelectorAll(".boreal-pill-tab[data-bcol]").forEach((t) => {
    t.classList.toggle("active", t.getAttribute("data-bcol") === "1");
  });

  if (typeof storedSwitchSection === "function") {
    storedSwitchSection("sheet-view");
  } else {
    document.querySelectorAll(".dash-section").forEach((sec) => sec.classList.remove("active"));
    const secSheet = document.getElementById("section-sheet-view");
    if (secSheet) secSheet.classList.add("active");
  }

  // Exibe a pílula da ficha e posiciona o indicador deslizante após a seção estar visível
  showSheetMobilePill();
}

// Aplicação de Cor de Destaque Boreal
function applyBorealAccent(col) {
  const box = document.getElementById("borealSheetBox");
  if (!box) return;
  box.style.setProperty("--sheet-accent", col);
  box.style.setProperty("--sheet-accent-glow", `${col}70`);
  box.style.setProperty("--sheet-accent-subtle", `${col}20`);
}

// Retrato do Personagem Boreal
function updateBorealPortraitDisplay(url) {
  const img = document.getElementById("borealPortraitImage");
  const empty = document.getElementById("borealPortraitEmpty");
  if (!img || !empty) return;
  if (url) {
    img.src = url;
    img.style.display = "block";
    empty.style.display = "none";
  } else {
    img.style.display = "none";
    empty.style.display = "flex";
  }
}

// Retrato do Espírito
function updateSpiritPortraitDisplay(url) {
  const img = document.getElementById("spiritPortraitImage");
  const empty = document.getElementById("spiritPortraitEmpty");
  if (!img || !empty) return;
  if (url) {
    img.src = url;
    img.style.display = "block";
    empty.style.display = "none";
  } else {
    img.style.display = "none";
    empty.style.display = "flex";
  }
}

// Cálculos em Tempo Real: Vitais (Vida, Resiliência, Proteção) e DTs (Físico, Mágico, Mental)
function recalcBorealVitalsAndDT() {
  if (!currentViewingSheet) return;

  const corpo = parseInt(document.getElementById("borealAttrCorpo")?.value, 10) || 0;
  const poder = parseInt(document.getElementById("borealAttrPoder")?.value, 10) || 0;
  const mente = parseInt(document.getElementById("borealAttrMente")?.value, 10) || 0;

  const fortitude = parseInt(currentViewingSheet.skills?.Fortitude, 10) || 0;
  const mistica = parseInt(currentViewingSheet.skills?.Mística, 10) || 0;
  const vontade = parseInt(currentViewingSheet.skills?.Vontade, 10) || 0;

  // Fórmulas Vitais
  // Vida: 10 + Atributo Corpo + Perícia Fortitude
  const maxHp = 10 + corpo + fortitude;
  const currentHp = Math.min(currentViewingSheet.hpCurrent ?? maxHp, maxHp);
  currentViewingSheet.hpMax = maxHp;
  currentViewingSheet.hpCurrent = currentHp;

  setElementText("borealHpCurrentDisplay", currentHp);
  setElementText("borealHpMaxDisplay", maxHp);
  const hpFill = document.getElementById("borealHpProgressBar");
  if (hpFill) hpFill.style.width = `${Math.max(0, Math.min(100, (currentHp / maxHp) * 100))}%`;

  // Resiliência: 10 + Atributo Mente + Perícia Vontade
  const maxRes = 10 + mente + vontade;
  const currentRes = Math.min(currentViewingSheet.resCurrent ?? maxRes, maxRes);
  currentViewingSheet.resMax = maxRes;
  currentViewingSheet.resCurrent = currentRes;

  setElementText("borealResCurrentDisplay", currentRes);
  setElementText("borealResMaxDisplay", maxRes);
  const resFill = document.getElementById("borealResProgressBar");
  if (resFill) resFill.style.width = `${Math.max(0, Math.min(100, (currentRes / maxRes) * 100))}%`;

  // Proteção: Base manual + Armaduras Equipadas
  const baseProt = parseInt(document.getElementById("borealProtBaseInput")?.value, 10) || 0;
  let equipProt = 0;
  if (currentViewingSheet.equippedSlots) {
    Object.values(currentViewingSheet.equippedSlots).forEach((slot) => {
      equipProt += parseInt(slot.prot, 10) || 0;
    });
  }

  const maxProt = baseProt + equipProt;
  currentViewingSheet.protBase = baseProt;
  currentViewingSheet.protMax = maxProt;
  currentViewingSheet.protCurrent = Math.min(currentViewingSheet.protCurrent ?? maxProt, maxProt);

  setElementText("borealProtCurrentDisplay", currentViewingSheet.protCurrent);
  setElementText("borealProtMaxDisplay", maxProt);
  setElementText("borealProtEquipDisplay", `+${equipProt}`);

  renderBorealProtectionDots(currentViewingSheet.protCurrent, maxProt);

  // Fórmulas DTs
  // DT Físico = 6 + Corpo + Fortitude
  // DT Mágico = 6 + Poder + Mística
  // DT Mental = 6 + Mente + Vontade
  const dtFisico = 6 + corpo + fortitude;
  const dtMagico = 6 + poder + mistica;
  const dtMental = 6 + mente + vontade;

  setElementText("borealDtFisicoVal", dtFisico);
  setElementText("borealDtMagicoVal", dtMagico);
  setElementText("borealDtMentalVal", dtMental);
}

// Renderizar Bolinhas de Proteção Gastáveis
function renderBorealProtectionDots(current, max) {
  const container = document.getElementById("borealProtDotsContainer");
  if (!container) return;
  container.innerHTML = "";

  for (let i = 0; i < max; i++) {
    const dot = document.createElement("div");
    dot.className = `boreal-prot-dot ${i >= current ? "spent" : ""}`;
    dot.title = `Proteção ${i + 1} de ${max} (clique para gastar/recuperar)`;

    dot.addEventListener("click", () => {
      if (dot.classList.contains("spent")) {
        currentViewingSheet.protCurrent = Math.min(max, (currentViewingSheet.protCurrent || 0) + 1);
      } else {
        currentViewingSheet.protCurrent = Math.max(0, (currentViewingSheet.protCurrent || 0) - 1);
      }
      setElementText("borealProtCurrentDisplay", currentViewingSheet.protCurrent);
      renderBorealProtectionDots(currentViewingSheet.protCurrent, max);
      triggerBorealAutoSave();
    });

    container.appendChild(dot);
  }
}

// Renderizar 20 Perícias em 2 Colunas
function renderBorealSkills() {
  const subcolA = document.getElementById("borealSkillsSubcolA");
  const subcolB = document.getElementById("borealSkillsSubcolB");
  if (!subcolA || !subcolB || !currentViewingSheet) return;

  subcolA.innerHTML = "";
  subcolB.innerHTML = "";

  const renderCol = (list, parent) => {
    list.forEach((skillName) => {
      const val = parseInt(currentViewingSheet.skills[skillName], 10) || 0;
      currentViewingSheet.skills[skillName] = val;

      const row = document.createElement("div");
      row.className = "boreal-skill-item-row";
      row.innerHTML = `
        <span class="boreal-skill-label">*${escapeHtml(skillName)}:</span>
        <div class="boreal-skill-controls-group">
          <button type="button" class="boreal-skill-btn-step btn-skill-minus" title="Diminuir">-</button>
          <span class="boreal-skill-val-display">+${val}</span>
          <button type="button" class="boreal-skill-btn-step btn-skill-plus" title="Aumentar">+</button>
        </div>
      `;

      const valDisplay = row.querySelector(".boreal-skill-val-display");
      const btnMinus = row.querySelector(".btn-skill-minus");
      const btnPlus = row.querySelector(".btn-skill-plus");

      btnMinus.addEventListener("click", () => {
        let current = parseInt(currentViewingSheet.skills[skillName], 10) || 0;
        if (current > 0) {
          currentViewingSheet.skills[skillName] = current - 1;
          valDisplay.textContent = `+${current - 1}`;
          recalcBorealVitalsAndDT();
          triggerBorealAutoSave();
        }
      });

      btnPlus.addEventListener("click", () => {
        let current = parseInt(currentViewingSheet.skills[skillName], 10) || 0;
        if (current < 5) {
          currentViewingSheet.skills[skillName] = current + 1;
          valDisplay.textContent = `+${current + 1}`;
          recalcBorealVitalsAndDT();
          triggerBorealAutoSave();
        }
      });

      parent.appendChild(row);
    });
  };

  renderCol(BOREAL_SKILLS_COL_A, subcolA);
  renderCol(BOREAL_SKILLS_COL_B, subcolB);
}

// Acordeão: Habilidades de Classe
function renderBorealClassSkills() {
  const list = document.getElementById("borealClassSkillsList");
  if (!list || !currentViewingSheet) return;
  list.innerHTML = "";

  currentViewingSheet.classSkills = currentViewingSheet.classSkills || [];
  currentViewingSheet.classSkills.forEach((skill, idx) => {
    const card = document.createElement("div");
    card.className = "boreal-accordion-card";
    card.innerHTML = `
      <div class="boreal-acc-header">
        <span class="boreal-acc-title">⚔️ ${escapeHtml(skill.name || `Habilidade ${idx + 1}`)}</span>
        <div style="display: flex; gap: 6px; align-items: center;">
          <button type="button" class="btn btn-ghost btn-xs btn-acc-toggle">↕</button>
          <button type="button" class="btn btn-ghost btn-xs btn-acc-del" style="color: var(--color-error);">✕</button>
        </div>
      </div>
      <div class="boreal-acc-body">
        <input type="text" class="boreal-field-input boreal-skill-name-inp" value="${escapeHtml(skill.name || "")}" placeholder="Nome da Habilidade">
        <textarea class="boreal-acc-textarea" rows="3" placeholder="Descrição do efeito, custo e regras...">${escapeHtml(skill.desc || "")}</textarea>
      </div>
    `;

    const body = card.querySelector(".boreal-acc-body");
    card.querySelector(".btn-acc-toggle").addEventListener("click", () => {
      body.classList.toggle("collapsed");
    });

    card.querySelector(".btn-acc-del").addEventListener("click", () => {
      currentViewingSheet.classSkills.splice(idx, 1);
      renderBorealClassSkills();
      triggerBorealAutoSave();
    });

    const nameInp = card.querySelector(".boreal-skill-name-inp");
    nameInp.addEventListener("input", (e) => {
      skill.name = e.target.value;
      card.querySelector(".boreal-acc-title").textContent = `⚔️ ${e.target.value || `Habilidade ${idx + 1}`}`;
      triggerBorealAutoSave();
    });

    const descInp = card.querySelector(".boreal-acc-textarea");
    descInp.addEventListener("input", (e) => {
      skill.desc = e.target.value;
      triggerBorealAutoSave();
    });

    list.appendChild(card);
  });
}

// Acordeão: Poções
function renderBorealPotions() {
  const list = document.getElementById("borealPotionsList");
  if (!list || !currentViewingSheet) return;
  list.innerHTML = "";

  currentViewingSheet.potions = currentViewingSheet.potions || [];
  currentViewingSheet.potions.forEach((pot, idx) => {
    const card = document.createElement("div");
    card.className = "boreal-accordion-card";
    const currentQty = pot.qty !== undefined ? pot.qty : 1;

    card.innerHTML = `
      <div class="boreal-acc-header">
        <span class="boreal-acc-title">🧪 ${escapeHtml(pot.name || `Poção ${idx + 1}`)} (${currentQty})</span>
        <div style="display: flex; gap: 6px; align-items: center;">
          <button type="button" class="btn btn-ghost btn-xs btn-pot-toggle">↕</button>
          <button type="button" class="btn btn-ghost btn-xs btn-pot-del" style="color: var(--color-error);">✕</button>
        </div>
      </div>
      <div class="boreal-acc-body">
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="text" class="boreal-field-input boreal-pot-name-inp" value="${escapeHtml(pot.name || "")}" placeholder="Nome da Poção" style="flex: 2;">
          <div style="display: flex; align-items: center; gap: 2px;">
            <button type="button" class="btn btn-ghost btn-xs btn-pot-qty-minus" style="padding: 2px 6px; font-weight: 800;">-</button>
            <input type="number" class="boreal-field-input boreal-pot-qty-inp" value="${currentQty}" min="0" placeholder="0" style="max-width: 50px; text-align: center;">
            <button type="button" class="btn btn-ghost btn-xs btn-pot-qty-plus" style="padding: 2px 6px; font-weight: 800;">+</button>
          </div>
        </div>
        <input type="text" class="boreal-field-input boreal-pot-ingr-inp" value="${escapeHtml(pot.ingredientes || "")}" placeholder="Ingredientes">
        <input type="text" class="boreal-field-input boreal-pot-prep-inp" value="${escapeHtml(pot.preparo || "")}" placeholder="Preparo">
        <input type="text" class="boreal-field-input boreal-pot-efeito-inp" value="${escapeHtml(pot.efeito || "")}" placeholder="Efeito">
        <textarea class="boreal-acc-textarea" rows="2" placeholder="Descrição adicional...">${escapeHtml(pot.desc || "")}</textarea>
      </div>
    `;

    const body = card.querySelector(".boreal-acc-body");
    card.querySelector(".btn-pot-toggle").addEventListener("click", () => body.classList.toggle("collapsed"));
    card.querySelector(".btn-pot-del").addEventListener("click", () => {
      currentViewingSheet.potions.splice(idx, 1);
      renderBorealPotions();
      triggerBorealAutoSave();
    });

    const qtyInp = card.querySelector(".boreal-pot-qty-inp");
    card.querySelector(".boreal-pot-name-inp").addEventListener("input", (e) => {
      pot.name = e.target.value;
      card.querySelector(".boreal-acc-title").textContent = `🧪 ${e.target.value || `Poção ${idx + 1}`} (${pot.qty !== undefined ? pot.qty : 0})`;
      triggerBorealAutoSave();
    });

    qtyInp.addEventListener("input", (e) => {
      pot.qty = Math.max(0, parseInt(e.target.value, 10) || 0);
      card.querySelector(".boreal-acc-title").textContent = `🧪 ${pot.name || `Poção ${idx + 1}`} (${pot.qty})`;
      triggerBorealAutoSave();
    });

    card.querySelector(".btn-pot-qty-minus").addEventListener("click", () => {
      pot.qty = Math.max(0, (pot.qty || 0) - 1);
      qtyInp.value = pot.qty;
      card.querySelector(".boreal-acc-title").textContent = `🧪 ${pot.name || `Poção ${idx + 1}`} (${pot.qty})`;
      triggerBorealAutoSave();
    });

    card.querySelector(".btn-pot-qty-plus").addEventListener("click", () => {
      pot.qty = (pot.qty || 0) + 1;
      qtyInp.value = pot.qty;
      card.querySelector(".boreal-acc-title").textContent = `🧪 ${pot.name || `Poção ${idx + 1}`} (${pot.qty})`;
      triggerBorealAutoSave();
    });

    card.querySelector(".boreal-pot-ingr-inp").addEventListener("input", (e) => { pot.ingredientes = e.target.value; triggerBorealAutoSave(); });
    card.querySelector(".boreal-pot-prep-inp").addEventListener("input", (e) => { pot.preparo = e.target.value; triggerBorealAutoSave(); });
    card.querySelector(".boreal-pot-efeito-inp").addEventListener("input", (e) => { pot.efeito = e.target.value; triggerBorealAutoSave(); });
    card.querySelector(".boreal-acc-textarea").addEventListener("input", (e) => { pot.desc = e.target.value; triggerBorealAutoSave(); });

    list.appendChild(card);
  });
}

// Acordeão: Amuletos
function renderBorealAmulets() {
  const list = document.getElementById("borealAmuletsList");
  if (!list || !currentViewingSheet) return;
  list.innerHTML = "";

  currentViewingSheet.amulets = currentViewingSheet.amulets || [];
  currentViewingSheet.amulets.forEach((amulet, idx) => {
    const card = document.createElement("div");
    card.className = "boreal-accordion-card";
    card.innerHTML = `
      <div class="boreal-acc-header">
        <span class="boreal-acc-title">🧿 ${escapeHtml(amulet.name || `Amuleto ${idx + 1}`)}</span>
        <div style="display: flex; gap: 6px; align-items: center;">
          <button type="button" class="btn btn-ghost btn-xs btn-am-toggle">↕</button>
          <button type="button" class="btn btn-ghost btn-xs btn-am-del" style="color: var(--color-error);">✕</button>
        </div>
      </div>
      <div class="boreal-acc-body">
        <input type="text" class="boreal-field-input boreal-am-name-inp" value="${escapeHtml(amulet.name || "")}" placeholder="Nome do Amuleto">
        <input type="text" class="boreal-field-input boreal-am-efeito-inp" value="${escapeHtml(amulet.efeito || "")}" placeholder="Efeito Mágico">
        <textarea class="boreal-acc-textarea" rows="3" placeholder="Descrição, histórico e sintonização...">${escapeHtml(amulet.desc || "")}</textarea>
      </div>
    `;

    const body = card.querySelector(".boreal-acc-body");
    card.querySelector(".btn-am-toggle").addEventListener("click", () => body.classList.toggle("collapsed"));
    card.querySelector(".btn-am-del").addEventListener("click", () => {
      currentViewingSheet.amulets.splice(idx, 1);
      renderBorealAmulets();
      triggerBorealAutoSave();
    });

    card.querySelector(".boreal-am-name-inp").addEventListener("input", (e) => {
      amulet.name = e.target.value;
      card.querySelector(".boreal-acc-title").textContent = `🧿 ${e.target.value || `Amuleto ${idx + 1}`}`;
      triggerBorealAutoSave();
    });
    card.querySelector(".boreal-am-efeito-inp").addEventListener("input", (e) => { amulet.efeito = e.target.value; triggerBorealAutoSave(); });
    card.querySelector(".boreal-acc-textarea").addEventListener("input", (e) => { amulet.desc = e.target.value; triggerBorealAutoSave(); });

    list.appendChild(card);
  });
}

// Equipamentos: 4 Slots Ativos (Cabeça, Mão, Corpo, Pernas)
function renderBorealEquippedSlots() {
  if (!currentViewingSheet) return;
  const slots = currentViewingSheet.equippedSlots || {};

  const bindSlot = (slotKey, nameInputId, protInputId, containerId) => {
    const slotData = slots[slotKey] || { name: "", prot: 0 };
    setInputValue(nameInputId, slotData.name || "");
    setInputValue(protInputId, slotData.prot || 0);

    const container = document.getElementById(containerId);
    const unequipBtn = container?.querySelector(".boreal-btn-unequip");
    if (unequipBtn) {
      unequipBtn.style.display = slotData.name ? "inline-block" : "none";
    }

    const protInp = document.getElementById(protInputId);
    if (protInp && !protInp.dataset.bound) {
      protInp.dataset.bound = "true";
      protInp.addEventListener("input", (e) => {
        if (!currentViewingSheet.equippedSlots[slotKey]) currentViewingSheet.equippedSlots[slotKey] = { name: "", prot: 0 };
        currentViewingSheet.equippedSlots[slotKey].prot = parseInt(e.target.value, 10) || 0;
        recalcBorealVitalsAndDT();
        triggerBorealAutoSave();
      });
    }
  };

  bindSlot("cabeca", "borealEquipCabecaName", "borealEquipCabecaProt", "slotEquipCabeca");
  bindSlot("mao", "borealEquipMaoName", "borealEquipMaoProt", "slotEquipMao");
  bindSlot("corpo", "borealEquipCorpoName", "borealEquipCorpoProt", "slotEquipCorpo");
  bindSlot("pernas", "borealEquipPernasName", "borealEquipPernasProt", "slotEquipPernas");
}

// Desequipar Item de Slot para Mochila
document.querySelectorAll(".boreal-btn-unequip").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!currentViewingSheet) return;
    const slotKey = btn.getAttribute("data-slot");
    const slot = currentViewingSheet.equippedSlots?.[slotKey];
    if (!slot || !slot.name) return;

    const protVal = parseInt(slot.prot, 10) || 0;
    currentViewingSheet.backpack = currentViewingSheet.backpack || [];
    currentViewingSheet.backpack.push({
      id: "bp_" + Date.now().toString(),
      name: slot.name,
      prot: protVal,
      efeito: slot.efeito || "",
      desc: slot.desc || ""
    });

    if (protVal > 0) {
      currentViewingSheet.protCurrent = Math.max(0, (currentViewingSheet.protCurrent || 0) - protVal);
    }

    currentViewingSheet.equippedSlots[slotKey] = { name: "", prot: 0, efeito: "", desc: "" };
    renderBorealEquippedSlots();
    renderBorealBackpack();
    recalcBorealVitalsAndDT();
    triggerBorealAutoSave();
    showToast(`"${slot.name}" desequipado e movido para a mochila.`, "info");
  });
});

// Mochila / Inventário Boreal com Acordeão e Ação de Equipar
function renderBorealBackpack() {
  const list = document.getElementById("borealBackpackList");
  if (!list || !currentViewingSheet) return;
  list.innerHTML = "";

  currentViewingSheet.backpack = currentViewingSheet.backpack || [];
  currentViewingSheet.backpack.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "boreal-accordion-card";
    const protDisplay = item.prot !== undefined && item.prot !== 0 ? item.prot : "";

    card.innerHTML = `
      <div class="boreal-acc-header" style="gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
          <span style="font-size: 0.95rem;">🎒</span>
          <input type="text" class="boreal-field-input bp-name-input" value="${escapeHtml(item.name || "")}" placeholder="Nome do Item" style="flex: 1; padding: 4px 8px; font-size: 0.82rem; font-weight: 700;">
          <div style="display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.05); border: 1px solid var(--boreal-border); border-radius: var(--radius-sm); padding: 2px 6px;">
            <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700;">Prot:</span>
            <input type="number" class="bp-prot-input" value="${protDisplay}" min="0" placeholder="0" style="width: 40px; background: transparent; border: none; color: var(--text-main); font-size: 0.82rem; font-weight: 800; text-align: center; outline: none;">
          </div>
        </div>
        <div style="display: flex; gap: 4px; align-items: center;">
          <button type="button" class="btn btn-ghost btn-xs btn-bp-toggle" title="Expandir/Recolher">↕</button>
          <button type="button" class="btn btn-ghost btn-xs btn-bp-del" style="color: var(--color-error); padding: 2px 6px;" title="Excluir">✕</button>
        </div>
      </div>
      <div class="boreal-acc-body">
        <input type="text" class="boreal-field-input bp-effect-input" value="${escapeHtml(item.efeito || "")}" placeholder="Efeito">
        <textarea class="boreal-acc-textarea bp-desc-input" rows="2" placeholder="Descrição do item...">${escapeHtml(item.desc || "")}</textarea>
        
        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--boreal-border);">
          <span style="font-size: 0.72rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">🛡️ Equipar no Slot:</span>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
            <button type="button" class="btn-equip-slot" data-slot="cabeca">Cabeça</button>
            <button type="button" class="btn-equip-slot" data-slot="mao">Mão</button>
            <button type="button" class="btn-equip-slot" data-slot="corpo">Corpo</button>
            <button type="button" class="btn-equip-slot" data-slot="pernas">Pernas</button>
          </div>
        </div>
      </div>
    `;

    const body = card.querySelector(".boreal-acc-body");
    card.querySelector(".btn-bp-toggle").addEventListener("click", () => body.classList.toggle("collapsed"));

    card.querySelector(".btn-bp-del").addEventListener("click", () => {
      currentViewingSheet.backpack.splice(idx, 1);
      renderBorealBackpack();
      triggerBorealAutoSave();
    });

    const nameInp = card.querySelector(".bp-name-input");
    nameInp.addEventListener("input", (e) => {
      item.name = e.target.value;
      triggerBorealAutoSave();
    });

    const protInp = card.querySelector(".bp-prot-input");
    protInp.addEventListener("input", (e) => {
      item.prot = Math.max(0, parseInt(e.target.value, 10) || 0);
      triggerBorealAutoSave();
    });

    const effectInp = card.querySelector(".bp-effect-input");
    effectInp.addEventListener("input", (e) => {
      item.efeito = e.target.value;
      triggerBorealAutoSave();
    });

    const descInp = card.querySelector(".bp-desc-input");
    descInp.addEventListener("input", (e) => {
      item.desc = e.target.value;
      triggerBorealAutoSave();
    });

    // Botões de Equipar nos 4 Slots
    card.querySelectorAll(".btn-equip-slot").forEach((btnSlot) => {
      btnSlot.addEventListener("click", () => {
        const dest = btnSlot.dataset.slot;
        if (!dest) return;

        currentViewingSheet.equippedSlots = currentViewingSheet.equippedSlots || {};
        const oldEquipped = currentViewingSheet.equippedSlots[dest];
        if (oldEquipped && oldEquipped.name) {
          const oldProt = parseInt(oldEquipped.prot, 10) || 0;
          currentViewingSheet.backpack.push({
            id: "bp_" + Date.now().toString(),
            name: oldEquipped.name,
            prot: oldProt,
            efeito: oldEquipped.efeito || "",
            desc: oldEquipped.desc || ""
          });

          // Subtrai a proteção do item que foi desequipado
          if (oldProt > 0) {
            currentViewingSheet.protCurrent = Math.max(0, (currentViewingSheet.protCurrent || 0) - oldProt);
          }
        }

        const itemProt = parseInt(item.prot, 10) || 0;
        currentViewingSheet.equippedSlots[dest] = {
          name: item.name || "Item",
          prot: itemProt,
          efeito: item.efeito || "",
          desc: item.desc || ""
        };

        // Ao equipar, a proteção adiciona às bolinhas e já vem marcada/ativa
        if (itemProt > 0) {
          currentViewingSheet.protCurrent = (currentViewingSheet.protCurrent || 0) + itemProt;
        }

        currentViewingSheet.backpack.splice(idx, 1);
        renderBorealEquippedSlots();
        renderBorealBackpack();
        recalcBorealVitalsAndDT();
        triggerBorealAutoSave();
        showToast(`"${item.name || "Item"}" equipado em ${dest.toUpperCase()}!`, "success");
      });
    });

    list.appendChild(card);
  });
}

// Magia: Popula Funções, Características, Perícias e Especialidades de acordo com o Espírito
function populateBorealMagicOptions() {
  const spiritSelect = document.getElementById("borealHeaderSpiritSelect");
  const spiritName = spiritSelect ? spiritSelect.value : "Sabedoria";
  const spiritData = BOREAL_SPIRITS_DATA[spiritName] || BOREAL_SPIRITS_DATA["Sabedoria"];

  const funcSelect = document.getElementById("borealMagicSelectFuncao");
  const caracSelect = document.getElementById("borealMagicSelectCaracteristica");
  const alvoSelect = document.getElementById("borealMagicSelectAlvo");
  const periciaSelect = document.getElementById("borealMagicSelectPericia");
  const specLabel = document.getElementById("borealMagicSpecialtyName");

  if (funcSelect) {
    funcSelect.innerHTML = spiritData.funcoes.map(f => `<option value="${f}">${f}</option>`).join("");
  }
  if (caracSelect) {
    caracSelect.innerHTML = spiritData.caracteristicas.map(c => `<option value="${c}">${c}</option>`).join("");
  }
  if (alvoSelect && alvoSelect.children.length === 0) {
    alvoSelect.innerHTML = BOREAL_TARGETS_LIST.map(a => `<option value="${a}">${a}</option>`).join("");
  }
  if (periciaSelect) {
    const spiritPericiasHtml = spiritData.pericias.map(p => `<option value="${p}">${p} (Espírito)</option>`).join("");
    const allPericiasHtml = BOREAL_ALL_SKILLS.filter(s => !spiritData.pericias.includes(s)).map(p => `<option value="${p}">${p}</option>`).join("");
    periciaSelect.innerHTML = `<optgroup label="Sugeridas pelo Espírito">${spiritPericiasHtml}</optgroup><optgroup label="Todas as Perícias">${allPericiasHtml}</optgroup>`;
  }

  // Especialidade Ativa
  const activeSpec = currentViewingSheet?.spirit?.specialty || spiritData.especialidades[0] || "Nenhuma";
  if (specLabel) specLabel.textContent = activeSpec;
}

// Disparo de Teste 2D6 + Perícia
const btnRollMagicTest = document.getElementById("btnBorealRollMagicTest");
if (btnRollMagicTest) {
  btnRollMagicTest.addEventListener("click", () => {
    if (!currentViewingSheet) return;

    const func = document.getElementById("borealMagicSelectFuncao")?.value || "";
    const carac = document.getElementById("borealMagicSelectCaracteristica")?.value || "";
    const alvo = document.getElementById("borealMagicSelectAlvo")?.value || "";
    const periciaName = document.getElementById("borealMagicSelectPericia")?.value || "Mística";
    const periciaMod = parseInt(currentViewingSheet.skills?.[periciaName], 10) || 0;

    const advMode = document.querySelector('input[name="borealRollAdv"]:checked')?.value || "normal";
    const useSpecialty = document.getElementById("borealMagicCheckSpecialty")?.checked || false;

    // Rolagem dos Dados: Normal (2d6), Vantagem (3d6), Desvantagem (1d6)
    let d1 = Math.floor(Math.random() * 6) + 1;
    let d2 = Math.floor(Math.random() * 6) + 1;
    let d3 = Math.floor(Math.random() * 6) + 1;
    let diceRolls = [d1, d2];
    let formulaLabel = "2d6";

    if (advMode === "advantage") {
      diceRolls = [d1, d2, d3];
      formulaLabel = "3d6 (Vantagem)";
    } else if (advMode === "disadvantage") {
      diceRolls = [d1];
      formulaLabel = "1d6 (Desvantagem)";
    }

    let diceTotal = diceRolls.reduce((acc, val) => acc + val, 0);
    let totalResult = diceTotal + periciaMod;
    let specBonusText = "";

    if (useSpecialty) {
      const d4 = Math.floor(Math.random() * 4) + 1;
      totalResult += d4;
      specBonusText = ` + 1d4 Concentração (${d4})`;
    }

    const resultBox = document.getElementById("borealMagicRollResult");
    if (resultBox) {
      resultBox.style.display = "block";
      resultBox.innerHTML = `
        <div style="font-weight: 800; font-size: 1.15rem; color: #22c55e;">RESULTADO FINAL: ${totalResult}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
          Magia: <strong>${escapeHtml(func)} de ${escapeHtml(carac)}</strong> em <strong>${escapeHtml(alvo)}</strong><br>
          ${formulaLabel}: [${diceRolls.join(" + ")}] = ${diceTotal} + ${periciaName} (+${periciaMod})${specBonusText}
        </div>
      `;
    }

    showToast(`Teste ${formulaLabel} (${periciaName}): Resultado ${totalResult}!`, "info");
  });
}

// Drawer Retrátil da Ficha do Espírito
const btnToggleSpiritDrawer = document.getElementById("btnToggleSpiritDrawer");
const spiritDrawer = document.getElementById("borealSpiritDrawer");
const btnCloseSpiritDrawer = document.getElementById("btnCloseSpiritDrawer");

if (btnToggleSpiritDrawer && spiritDrawer) {
  btnToggleSpiritDrawer.addEventListener("click", () => {
    spiritDrawer.classList.toggle("open");
  });
}
if (btnCloseSpiritDrawer && spiritDrawer) {
  btnCloseSpiritDrawer.addEventListener("click", () => {
    spiritDrawer.classList.remove("open");
  });
}

// Popula Campos e Detalhes do Drawer do Espírito
function populateSpiritDrawerFields() {
  if (!currentViewingSheet || !currentViewingSheet.spirit) return;
  const sp = currentViewingSheet.spirit;

  setInputValue("spiritFieldNome", sp.nome || "Espírito Guardião");
  setInputValue("spiritFieldNivel", sp.nivel || 1);
  setInputValue("spiritFieldTipo", sp.tipo || "Sabedoria");

  setElementText("spiritHpCurrent", sp.hpCurrent ?? 10);
  setElementText("spiritHpMax", sp.hpMax ?? 10);
  setElementText("spiritConexaoVal", (sp.conexao ?? 0) >= 0 ? `+${sp.conexao ?? 0}` : `${sp.conexao}`);
  setElementText("spiritProtCurrent", sp.protCurrent ?? 1);
  setElementText("spiritProtMax", sp.protMax ?? 1);

  setInputValue("spiritDtFisico", sp.dtFisico ?? 6);
  setInputValue("spiritDtMagico", sp.dtMagico ?? 6);
  setInputValue("spiritDtMental", sp.dtMental ?? 6);

  setInputValue("spiritAttrCorpo", sp.attrCorpo ?? 1);
  setInputValue("spiritAttrPoder", sp.attrPoder ?? 1);
  setInputValue("spiritAttrMente", sp.attrMente ?? 1);

  setInputValue("spiritDescAparencia", sp.aparencia || "");
  setInputValue("spiritDescPersonalidade", sp.personalidade || "");
  setInputValue("spiritDescHabitos", sp.habitos || "");

  // Popula Listas de Funções, Características e Especialidades do Espírito
  const spiritData = BOREAL_SPIRITS_DATA[sp.tipo] || BOREAL_SPIRITS_DATA["Sabedoria"];
  const funcsList = document.getElementById("spiritCapFuncoesList");
  const caracsList = document.getElementById("spiritCapCaracteristicasList");
  const specsList = document.getElementById("spiritCapEspecialidadesList");
  const specSelect = document.getElementById("spiritSelectedSpecialty");

  if (funcsList) funcsList.innerHTML = spiritData.funcoes.map(f => `<div>• ${f}</div>`).join("");
  if (caracsList) caracsList.innerHTML = spiritData.caracteristicas.map(c => `<div>• ${c}</div>`).join("");
  if (specsList) specsList.innerHTML = spiritData.especialidades.map(s => `<span class="boreal-spec-tag">${s}</span>`).join("");

  if (specSelect) {
    specSelect.innerHTML = spiritData.especialidades.map(s => `<option value="${s}" ${s === sp.specialty ? "selected" : ""}>${s}</option>`).join("");
    specSelect.addEventListener("change", (e) => {
      sp.specialty = e.target.value;
      const specLabel = document.getElementById("borealMagicSpecialtyName");
      if (specLabel) specLabel.textContent = sp.specialty;
      triggerBorealAutoSave();
    });
  }
}

// Botões de Step de Vida, Conexão e Proteção do Personagem e do Espírito
["btnBorealHpMinus", "btnBorealHpPlus", "btnBorealResMinus", "btnBorealResPlus"].forEach(id => {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (!currentViewingSheet) return;
    if (id === "btnBorealHpMinus") currentViewingSheet.hpCurrent = Math.max(0, (currentViewingSheet.hpCurrent ?? currentViewingSheet.hpMax) - 1);
    if (id === "btnBorealHpPlus") currentViewingSheet.hpCurrent = Math.min(currentViewingSheet.hpMax, (currentViewingSheet.hpCurrent ?? currentViewingSheet.hpMax) + 1);
    if (id === "btnBorealResMinus") currentViewingSheet.resCurrent = Math.max(0, (currentViewingSheet.resCurrent ?? currentViewingSheet.resMax) - 1);
    if (id === "btnBorealResPlus") currentViewingSheet.resCurrent = Math.min(currentViewingSheet.resMax, (currentViewingSheet.resCurrent ?? currentViewingSheet.resMax) + 1);
    recalcBorealVitalsAndDT();
    triggerBorealAutoSave();
  });
});

["btnSpiritHpMinus", "btnSpiritHpPlus", "btnSpiritConMinus", "btnSpiritConPlus", "btnSpiritProtMinus", "btnSpiritProtPlus"].forEach(id => {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (!currentViewingSheet || !currentViewingSheet.spirit) return;
    const sp = currentViewingSheet.spirit;
    if (id === "btnSpiritHpMinus") sp.hpCurrent = Math.max(0, (sp.hpCurrent ?? 10) - 1);
    if (id === "btnSpiritHpPlus") sp.hpCurrent = (sp.hpCurrent ?? 10) + 1;
    if (id === "btnSpiritConMinus") sp.conexao = (sp.conexao ?? 0) - 1;
    if (id === "btnSpiritConPlus") sp.conexao = (sp.conexao ?? 0) + 1;
    if (id === "btnSpiritProtMinus") sp.protCurrent = Math.max(0, (sp.protCurrent ?? 1) - 1);
    if (id === "btnSpiritProtPlus") sp.protCurrent = (sp.protCurrent ?? 1) + 1;
    populateSpiritDrawerFields();
    triggerBorealAutoSave();
  });
});

// Event Listeners de Mudança de Atributos, Espírito e Cabeçalho Boreal
["borealAttrCorpo", "borealAttrPoder", "borealAttrMente", "borealProtBaseInput"].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("input", () => {
      recalcBorealVitalsAndDT();
      triggerBorealAutoSave();
    });
  }
});

const headerSpiritSelect = document.getElementById("borealHeaderSpiritSelect");
if (headerSpiritSelect) {
  headerSpiritSelect.addEventListener("change", (e) => {
    if (!currentViewingSheet) return;
    const newSpType = e.target.value;
    currentViewingSheet.spirit = currentViewingSheet.spirit || {};
    currentViewingSheet.spirit.tipo = newSpType;
    setInputValue("borealFieldSpiritType", newSpType);
    setInputValue("spiritFieldTipo", newSpType);
    populateBorealMagicOptions();
    populateSpiritDrawerFields();
    triggerBorealAutoSave();
  });
}

// Adicionar Nova Habilidade de Classe, Poção, Amuleto e Mochila
const btnAddBorealSkill = document.getElementById("btnAddBorealClassSkill");
if (btnAddBorealSkill) {
  btnAddBorealSkill.addEventListener("click", () => {
    if (!currentViewingSheet) return;
    currentViewingSheet.classSkills = currentViewingSheet.classSkills || [];
    currentViewingSheet.classSkills.push({ name: "Nova Habilidade", desc: "" });
    renderBorealClassSkills();
    triggerBorealAutoSave();
  });
}

const btnAddBorealPot = document.getElementById("btnAddBorealPotion");
if (btnAddBorealPot) {
  btnAddBorealPot.addEventListener("click", () => {
    if (!currentViewingSheet) return;
    currentViewingSheet.potions = currentViewingSheet.potions || [];
    currentViewingSheet.potions.push({ name: "Nova Poção", qty: 1, ingredientes: "", preparo: "", efeito: "", desc: "" });
    renderBorealPotions();
    triggerBorealAutoSave();
  });
}

const btnAddBorealAm = document.getElementById("btnAddBorealAmulet");
if (btnAddBorealAm) {
  btnAddBorealAm.addEventListener("click", () => {
    if (!currentViewingSheet) return;
    currentViewingSheet.amulets = currentViewingSheet.amulets || [];
    currentViewingSheet.amulets.push({ name: "Novo Amuleto", efeito: "", desc: "" });
    renderBorealAmulets();
    triggerBorealAutoSave();
  });
}

const btnAddBorealBp = document.getElementById("btnAddBorealBackpackItem");
if (btnAddBorealBp) {
  btnAddBorealBp.addEventListener("click", () => {
    if (!currentViewingSheet) return;

    currentViewingSheet.backpack = currentViewingSheet.backpack || [];
    currentViewingSheet.backpack.push({
      id: "bp_" + Date.now().toString(),
      name: "",
      prot: 0,
      efeito: "",
      desc: ""
    });
    renderBorealBackpack();
    triggerBorealAutoSave();
  });
}

// Sincronização Bidirecional e Auto-Save dos Campos da Ficha Boreal
// 1. Nome do Personagem (Cabeçalho Boreal)
const bCharName = document.getElementById("borealCharName");
if (bCharName) {
  bCharName.addEventListener("input", (e) => {
    if (currentViewingSheet) currentViewingSheet.name = e.target.value;
    triggerBorealAutoSave();
  });
}

// 2. Classe do Personagem (Cabeçalho Boreal)
const bCharClass = document.getElementById("borealCharClass");
if (bCharClass) {
  bCharClass.addEventListener("input", (e) => {
    if (currentViewingSheet) {
      currentViewingSheet.class = e.target.value;
      currentViewingSheet.characterClass = e.target.value;
    }
    triggerBorealAutoSave();
  });
}

// 3. Idade do Personagem (Coluna 1 Boreal)
const bFieldAge = document.getElementById("borealFieldAge");
if (bFieldAge) {
  bFieldAge.addEventListener("input", (e) => {
    if (currentViewingSheet) currentViewingSheet.age = e.target.value;
    triggerBorealAutoSave();
  });
}

// 4. Nível do Personagem
const bCharLevel = document.getElementById("borealCharLevel");
const bFieldLevel = document.getElementById("borealFieldCharLevel");
if (bCharLevel && bFieldLevel) {
  bCharLevel.addEventListener("input", (e) => {
    bFieldLevel.value = e.target.value;
    if (currentViewingSheet) currentViewingSheet.level = parseInt(e.target.value, 10) || 1;
    triggerBorealAutoSave();
  });
  bFieldLevel.addEventListener("input", (e) => {
    bCharLevel.value = e.target.value;
    if (currentViewingSheet) currentViewingSheet.level = parseInt(e.target.value, 10) || 1;
    triggerBorealAutoSave();
  });
}

// 5. Moedas do Personagem (RUBI / OURO / PRATA / BRONZE) + Modal de Conversão
const BOREAL_COIN_RATES = {
  rubi: 1000,
  ouro: 100,
  prata: 10,
  bronze: 1
};

const BOREAL_COIN_NAMES = {
  rubi: "Rubi",
  ouro: "Ouro",
  prata: "Prata",
  bronze: "Bronze"
};

const bCoinInputs = {
  rubi: document.getElementById("borealCoinRubi"),
  ouro: document.getElementById("borealCoinOuro"),
  prata: document.getElementById("borealCoinPrata"),
  bronze: document.getElementById("borealCoinBronze")
};

Object.entries(bCoinInputs).forEach(([coinKey, inputEl]) => {
  if (!inputEl) return;
  inputEl.addEventListener("input", (e) => {
    const cleanVal = Math.max(0, Math.floor(Number(e.target.value) || 0));
    if (currentViewingSheet) {
      currentViewingSheet.currencies = currentViewingSheet.currencies || { rubi: 0, ouro: 0, prata: 0, bronze: 0 };
      currentViewingSheet.currencies[coinKey] = cleanVal;
    }
    triggerBorealAutoSave();
  });
});

function syncBorealCoinInputsFromSheet() {
  if (!currentViewingSheet || !currentViewingSheet.currencies) return;
  setInputValue("borealCoinRubi", currentViewingSheet.currencies.rubi ?? 0);
  setInputValue("borealCoinOuro", currentViewingSheet.currencies.ouro ?? 0);
  setInputValue("borealCoinPrata", currentViewingSheet.currencies.prata ?? 0);
  setInputValue("borealCoinBronze", currentViewingSheet.currencies.bronze ?? 0);
}

// Modal de Conversão de Moedas
const btnOpenCurrencyConvert = document.getElementById("btnOpenCurrencyConvert");
const currencyConvertFrom = document.getElementById("currencyConvertFrom");
const currencyConvertTo = document.getElementById("currencyConvertTo");
const currencyConvertAmount = document.getElementById("currencyConvertAmount");
const currencyConvertResult = document.getElementById("currencyConvertResult");
const currencyConvertBalanceHint = document.getElementById("currencyConvertBalanceHint");
const currencyConvertStatusMsg = document.getElementById("currencyConvertStatusMsg");
const btnConfirmCurrencyConvert = document.getElementById("btnConfirmCurrencyConvert");

function evaluateCurrencyConversion() {
  if (!currentViewingSheet || !currencyConvertFrom || !currencyConvertTo || !currencyConvertAmount) {
    return { valid: false };
  }

  const currencies = currentViewingSheet.currencies || { rubi: 0, ouro: 0, prata: 0, bronze: 0 };
  const fromCoin = currencyConvertFrom.value;
  const toCoin = currencyConvertTo.value;
  const availableFrom = Math.max(0, parseInt(currencies[fromCoin], 10) || 0);
  const currentTo = Math.max(0, parseInt(currencies[toCoin], 10) || 0);

  if (currencyConvertBalanceHint) {
    currencyConvertBalanceHint.textContent = `Saldo disponível: ${availableFrom} ${BOREAL_COIN_NAMES[fromCoin]} | Destino atual: ${currentTo} ${BOREAL_COIN_NAMES[toCoin]}`;
  }

  const rawStr = String(currencyConvertAmount.value ?? "").trim();

  // Impede valores vazios ou cortados/decimais
  if (!rawStr) {
    if (currencyConvertResult) currencyConvertResult.textContent = "0";
    if (currencyConvertStatusMsg) {
      currencyConvertStatusMsg.textContent = "Digite uma quantidade inteira para converter.";
      currencyConvertStatusMsg.className = "currency-convert-status";
    }
    if (btnConfirmCurrencyConvert) btnConfirmCurrencyConvert.disabled = true;
    return { valid: false };
  }

  if (rawStr.includes(".") || rawStr.includes(",") || !/^\d+$/.test(rawStr)) {
    if (currencyConvertResult) currencyConvertResult.textContent = "—";
    if (currencyConvertStatusMsg) {
      currencyConvertStatusMsg.textContent = "Não é permitido converter valores cortados. Digite apenas números inteiros.";
      currencyConvertStatusMsg.className = "currency-convert-status error";
    }
    if (btnConfirmCurrencyConvert) btnConfirmCurrencyConvert.disabled = true;
    return { valid: false };
  }

  const amount = parseInt(rawStr, 10);
  if (!Number.isInteger(amount) || amount <= 0) {
    if (currencyConvertResult) currencyConvertResult.textContent = "0";
    if (currencyConvertStatusMsg) {
      currencyConvertStatusMsg.textContent = "Informe um valor inteiro maior que zero.";
      currencyConvertStatusMsg.className = "currency-convert-status error";
    }
    if (btnConfirmCurrencyConvert) btnConfirmCurrencyConvert.disabled = true;
    return { valid: false };
  }

  if (fromCoin === toCoin) {
    if (currencyConvertResult) currencyConvertResult.textContent = `${amount} ${BOREAL_COIN_NAMES[toCoin]}`;
    if (currencyConvertStatusMsg) {
      currencyConvertStatusMsg.textContent = "Selecione moedas diferentes para converter.";
      currencyConvertStatusMsg.className = "currency-convert-status error";
    }
    if (btnConfirmCurrencyConvert) btnConfirmCurrencyConvert.disabled = true;
    return { valid: false };
  }

  const fromRate = BOREAL_COIN_RATES[fromCoin] || 1;
  const toRate = BOREAL_COIN_RATES[toCoin] || 1;

  // Verifica se o jogador possui saldo suficiente da moeda de origem
  if (amount > availableFrom) {
    if (currencyConvertResult) currencyConvertResult.textContent = "—";
    if (currencyConvertStatusMsg) {
      currencyConvertStatusMsg.textContent = `Você não tem ${BOREAL_COIN_NAMES[fromCoin]} suficiente (Saldo: ${availableFrom}).`;
      currencyConvertStatusMsg.className = "currency-convert-status error";
    }
    if (btnConfirmCurrencyConvert) btnConfirmCurrencyConvert.disabled = true;
    return { valid: false };
  }

  const totalBronzeValue = amount * fromRate;

  // Verifica se atinge o valor mínimo para 1 unidade inteira da moeda destino
  if (totalBronzeValue < toRate) {
    const minRequired = Math.ceil(toRate / fromRate);
    if (currencyConvertResult) currencyConvertResult.textContent = "0";
    if (currencyConvertStatusMsg) {
      currencyConvertStatusMsg.textContent = `Quantidade insuficiente! São necessários pelo menos ${minRequired} ${BOREAL_COIN_NAMES[fromCoin]} para obter 1 ${BOREAL_COIN_NAMES[toCoin]}.`;
      currencyConvertStatusMsg.className = "currency-convert-status error";
    }
    if (btnConfirmCurrencyConvert) btnConfirmCurrencyConvert.disabled = true;
    return { valid: false };
  }

  // Verifica se a conversão gera um valor inteiro exato (sem valor cortado/quebrado)
  if (totalBronzeValue % toRate !== 0) {
    const stepRequired = Math.ceil(toRate / fromRate);
    if (currencyConvertResult) currencyConvertResult.textContent = "—";
    if (currencyConvertStatusMsg) {
      currencyConvertStatusMsg.textContent = `Não é possível converter valores cortados! Use múltiplos de ${stepRequired} ${BOREAL_COIN_NAMES[fromCoin]}.`;
      currencyConvertStatusMsg.className = "currency-convert-status error";
    }
    if (btnConfirmCurrencyConvert) btnConfirmCurrencyConvert.disabled = true;
    return { valid: false };
  }

  const gainedTo = totalBronzeValue / toRate;
  const finalToBalance = currentTo + gainedTo;
  const finalFromBalance = availableFrom - amount;

  if (currencyConvertResult) {
    currencyConvertResult.textContent = `+${gainedTo} ${BOREAL_COIN_NAMES[toCoin]} (Total: ${finalToBalance})`;
  }
  if (currencyConvertStatusMsg) {
    currencyConvertStatusMsg.textContent = `Restará ${finalFromBalance} ${BOREAL_COIN_NAMES[fromCoin]} e você ficará com ${finalToBalance} ${BOREAL_COIN_NAMES[toCoin]} no total.`;
    currencyConvertStatusMsg.className = "currency-convert-status ok";
  }
  if (btnConfirmCurrencyConvert) btnConfirmCurrencyConvert.disabled = false;

  return {
    valid: true,
    fromCoin,
    toCoin,
    amount,
    gainedTo,
    finalFromBalance,
    finalToBalance
  };
}

if (btnOpenCurrencyConvert) {
  btnOpenCurrencyConvert.addEventListener("click", () => {
    if (!currentViewingSheet) return;
    currentViewingSheet.currencies = currentViewingSheet.currencies || { rubi: 0, ouro: 0, prata: 0, bronze: 0 };
    if (currencyConvertAmount) currencyConvertAmount.value = "";
    evaluateCurrencyConversion();
    openModalById("modalCurrencyConvert");
  });
}

if (currencyConvertFrom) {
  currencyConvertFrom.addEventListener("change", evaluateCurrencyConversion);
}
if (currencyConvertTo) {
  currencyConvertTo.addEventListener("change", evaluateCurrencyConversion);
}
if (currencyConvertAmount) {
  currencyConvertAmount.addEventListener("keydown", (e) => {
    if (e.key === "." || e.key === "," || e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") {
      e.preventDefault();
    }
  });
  currencyConvertAmount.addEventListener("input", evaluateCurrencyConversion);
}

if (btnConfirmCurrencyConvert) {
  btnConfirmCurrencyConvert.addEventListener("click", () => {
    const res = evaluateCurrencyConversion();
    if (!res.valid || !currentViewingSheet) return;

    currentViewingSheet.currencies = currentViewingSheet.currencies || { rubi: 0, ouro: 0, prata: 0, bronze: 0 };
    currentViewingSheet.currencies[res.fromCoin] = res.finalFromBalance;
    currentViewingSheet.currencies[res.toCoin] = res.finalToBalance;

    syncBorealCoinInputsFromSheet();
    triggerBorealAutoSave();
    closeModalById("modalCurrencyConvert");
    showToast(`Conversão realizada: -${res.amount} ${BOREAL_COIN_NAMES[res.fromCoin]} → +${res.gainedTo} ${BOREAL_COIN_NAMES[res.toCoin]}!`, "success");
  });
}

// 6. Nome do Espírito
const bFieldSpirit = document.getElementById("borealFieldSpirit");
const spFieldNome = document.getElementById("spiritFieldNome");
if (bFieldSpirit && spFieldNome) {
  bFieldSpirit.addEventListener("input", (e) => {
    spFieldNome.value = e.target.value;
    if (currentViewingSheet?.spirit) currentViewingSheet.spirit.nome = e.target.value;
    triggerBorealAutoSave();
  });
  spFieldNome.addEventListener("input", (e) => {
    bFieldSpirit.value = e.target.value;
    if (currentViewingSheet?.spirit) currentViewingSheet.spirit.nome = e.target.value;
    triggerBorealAutoSave();
  });
}

// 7. Campos adicionais do Espírito Drawer disparando AutoSave
["spiritFieldNivel", "spiritDtFisico", "spiritDtMagico", "spiritDtMental", "spiritAttrCorpo", "spiritAttrPoder", "spiritAttrMente", "spiritDescAparencia", "spiritDescPersonalidade", "spiritDescHabitos"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("input", () => triggerBorealAutoSave());
  }
});

// Sincronização do Seletor de Tipo do Espírito (Drawer <-> Cabeçalho)
const drawerSpiritTypeSelect = document.getElementById("spiritFieldTipo");
if (drawerSpiritTypeSelect) {
  drawerSpiritTypeSelect.addEventListener("change", (e) => {
    if (!currentViewingSheet) return;
    const newSpType = e.target.value;
    currentViewingSheet.spirit = currentViewingSheet.spirit || {};
    currentViewingSheet.spirit.tipo = newSpType;
    setInputValue("borealHeaderSpiritSelect", newSpType);
    populateBorealMagicOptions();
    populateSpiritDrawerFields();
    triggerBorealAutoSave();
  });
}

// ==========================================================================
// CROPPER E ZOOM INTERATIVO PARA FOTO DE PERSONAGEM E ESPÍRITO
// ==========================================================================
let sheetCropLoadedImg = null;
let sheetCropScale = 1;
let sheetCropMinScale = 1;
let sheetCropOffsetX = 0;
let sheetCropOffsetY = 0;
let isSheetCropDragging = false;
let sheetCropDragStartX = 0;
let sheetCropDragStartY = 0;
let sheetCropInitialOffX = 0;
let sheetCropInitialOffY = 0;
let sheetCropTarget = "boreal-char"; // "boreal-char", "boreal-spirit", "ed-char"

const cropSheetCanvas = document.getElementById("cropSheetCanvas");
const zoomSheetSlider = document.getElementById("zoomSheetSlider");
const btnSheetZoomIn = document.getElementById("btnSheetZoomIn");
const btnSheetZoomOut = document.getElementById("btnSheetZoomOut");
const btnResetSheetCrop = document.getElementById("btnResetSheetCrop");
const btnSaveSheetCrop = document.getElementById("btnSaveSheetCrop");

function setupSheetCropper(img) {
  sheetCropLoadedImg = img;
  const canvasSize = 280;
  sheetCropMinScale = Math.max(canvasSize / img.width, canvasSize / img.height);
  sheetCropScale = sheetCropMinScale;

  if (zoomSheetSlider) zoomSheetSlider.value = "1";

  sheetCropOffsetX = (canvasSize - img.width * sheetCropScale) / 2;
  sheetCropOffsetY = (canvasSize - img.height * sheetCropScale) / 2;

  clampSheetCropOffsets();
  drawSheetCropCanvas();
}

function clampSheetCropOffsets() {
  if (!sheetCropLoadedImg) return;
  const canvasSize = 280;
  const w = sheetCropLoadedImg.width * sheetCropScale;
  const h = sheetCropLoadedImg.height * sheetCropScale;

  if (sheetCropOffsetX > 0) sheetCropOffsetX = 0;
  if (sheetCropOffsetX + w < canvasSize) sheetCropOffsetX = canvasSize - w;
  if (sheetCropOffsetY > 0) sheetCropOffsetY = 0;
  if (sheetCropOffsetY + h < canvasSize) sheetCropOffsetY = canvasSize - h;
}

function drawSheetCropCanvas() {
  if (!cropSheetCanvas || !sheetCropLoadedImg) return;
  const ctx = cropSheetCanvas.getContext("2d");
  const size = 280;
  ctx.clearRect(0, 0, size, size);

  ctx.fillStyle = "#06070a";
  ctx.fillRect(0, 0, size, size);

  ctx.drawImage(
    sheetCropLoadedImg,
    sheetCropOffsetX,
    sheetCropOffsetY,
    sheetCropLoadedImg.width * sheetCropScale,
    sheetCropLoadedImg.height * sheetCropScale
  );

  // Guia de terços
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1;
  const third = size / 3;
  ctx.beginPath();
  ctx.moveTo(third, 0); ctx.lineTo(third, size);
  ctx.moveTo(third * 2, 0); ctx.lineTo(third * 2, size);
  ctx.moveTo(0, third); ctx.lineTo(size, third);
  ctx.moveTo(0, third * 2); ctx.lineTo(size, third * 2);
  ctx.stroke();

  // Borda brilhante
  ctx.strokeStyle = "rgba(59, 130, 246, 0.85)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  ctx.restore();
}

function applySheetCropZoom(zoomFactor) {
  if (!sheetCropLoadedImg) return;
  const canvasSize = 280;
  const clamped = Math.max(1, Math.min(4, zoomFactor));
  const newScale = sheetCropMinScale * clamped;

  const centerX = (canvasSize / 2 - sheetCropOffsetX) / sheetCropScale;
  const centerY = (canvasSize / 2 - sheetCropOffsetY) / sheetCropScale;

  sheetCropScale = newScale;
  sheetCropOffsetX = canvasSize / 2 - centerX * sheetCropScale;
  sheetCropOffsetY = canvasSize / 2 - centerY * sheetCropScale;

  clampSheetCropOffsets();
  drawSheetCropCanvas();

  if (zoomSheetSlider) zoomSheetSlider.value = clamped.toFixed(2);
}

if (cropSheetCanvas) {
  cropSheetCanvas.addEventListener("mousedown", (e) => {
    if (!sheetCropLoadedImg) return;
    isSheetCropDragging = true;
    sheetCropDragStartX = e.clientX;
    sheetCropDragStartY = e.clientY;
    sheetCropInitialOffX = sheetCropOffsetX;
    sheetCropInitialOffY = sheetCropOffsetY;
  });

  window.addEventListener("mousemove", (e) => {
    if (!isSheetCropDragging || !sheetCropLoadedImg) return;
    sheetCropOffsetX = sheetCropInitialOffX + (e.clientX - sheetCropDragStartX);
    sheetCropOffsetY = sheetCropInitialOffY + (e.clientY - sheetCropDragStartY);
    clampSheetCropOffsets();
    drawSheetCropCanvas();
  });

  window.addEventListener("mouseup", () => {
    isSheetCropDragging = false;
  });

  cropSheetCanvas.addEventListener("touchstart", (e) => {
    if (!sheetCropLoadedImg || e.touches.length === 0) return;
    isSheetCropDragging = true;
    sheetCropDragStartX = e.touches[0].clientX;
    sheetCropDragStartY = e.touches[0].clientY;
    sheetCropInitialOffX = sheetCropOffsetX;
    sheetCropInitialOffY = sheetCropOffsetY;
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (!isSheetCropDragging || !sheetCropLoadedImg || e.touches.length === 0) return;
    sheetCropOffsetX = sheetCropInitialOffX + (e.touches[0].clientX - sheetCropDragStartX);
    sheetCropOffsetY = sheetCropInitialOffY + (e.touches[0].clientY - sheetCropDragStartY);
    clampSheetCropOffsets();
    drawSheetCropCanvas();
  }, { passive: true });

  window.addEventListener("touchend", () => {
    isSheetCropDragging = false;
  });

  cropSheetCanvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (!sheetCropLoadedImg || !zoomSheetSlider) return;
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    applySheetCropZoom(parseFloat(zoomSheetSlider.value) + delta);
  }, { passive: false });
}

if (zoomSheetSlider) {
  zoomSheetSlider.addEventListener("input", () => {
    applySheetCropZoom(parseFloat(zoomSheetSlider.value));
  });
}
if (btnSheetZoomIn) {
  btnSheetZoomIn.addEventListener("click", () => {
    applySheetCropZoom(parseFloat(zoomSheetSlider.value || "1") + 0.2);
  });
}
if (btnSheetZoomOut) {
  btnSheetZoomOut.addEventListener("click", () => {
    applySheetCropZoom(parseFloat(zoomSheetSlider.value || "1") - 0.2);
  });
}
if (btnResetSheetCrop) {
  btnResetSheetCrop.addEventListener("click", () => {
    if (sheetCropLoadedImg) setupSheetCropper(sheetCropLoadedImg);
  });
}

function handleImageCropFile(file, targetType) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("Por favor, selecione um arquivo de imagem válido.", "error");
    return;
  }
  sheetCropTarget = targetType;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      setupSheetCropper(img);
      openModalById("modalCropSheetAvatar");
    };
    img.onerror = () => showToast("Erro ao ler imagem selecionada.", "error");
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

if (btnSaveSheetCrop) {
  btnSaveSheetCrop.addEventListener("click", () => {
    if (!sheetCropLoadedImg || !currentViewingSheet) return;

    try {
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = 300;
      exportCanvas.height = 300;
      const ctx = exportCanvas.getContext("2d");

      const canvasSize = 280;
      const srcX = (0 - sheetCropOffsetX) / sheetCropScale;
      const srcY = (0 - sheetCropOffsetY) / sheetCropScale;
      const srcSize = canvasSize / sheetCropScale;

      ctx.drawImage(sheetCropLoadedImg, srcX, srcY, srcSize, srcSize, 0, 0, 300, 300);
      const dataUrl = exportCanvas.toDataURL("image/jpeg", 0.8);

      if (sheetCropTarget === "boreal-char") {
        currentViewingSheet.avatarUrl = dataUrl;
        updateBorealPortraitDisplay(dataUrl);
        triggerBorealAutoSave();
      } else if (sheetCropTarget === "boreal-spirit") {
        currentViewingSheet.spirit = currentViewingSheet.spirit || {};
        currentViewingSheet.spirit.avatarUrl = dataUrl;
        updateSpiritPortraitDisplay(dataUrl);
        triggerBorealAutoSave();
      } else if (sheetCropTarget === "ed-char") {
        applyNewPortrait(dataUrl);
      } else if (sheetCropTarget === "npc") {
        const preview = document.getElementById("npcAvatarPreview");
        if (preview) {
          preview.innerHTML = `<img src="${dataUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
        }
        const hiddenInp = document.getElementById("npcAvatarUrl");
        if (hiddenInp) hiddenInp.value = dataUrl;
        closeModalById("modalCropSheetAvatar");
        openModalById("modalCreateNPC");
        showToast("Foto do NPC ajustada com sucesso!", "success");
        return;
      }

      closeModalById("modalCropSheetAvatar");
      triggerBorealAutoSave();
      showToast("Foto ajustada e aplicada com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao salvar crop:", err);
      showToast("Não foi possível recortar imagem: " + err.message, "error");
    }
  });
}

// Disparadores de Upload com Cropper Integrado
const btnBorealPortraitTrig = document.getElementById("btnBorealPortraitTrigger");
const borealPortraitFileInput = document.getElementById("borealPortraitFileInput");
if (btnBorealPortraitTrig && borealPortraitFileInput) {
  btnBorealPortraitTrig.addEventListener("click", () => {
    borealPortraitFileInput.value = "";
    borealPortraitFileInput.click();
  });
  borealPortraitFileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageCropFile(e.target.files[0], "boreal-char");
    }
  });
}

const btnSpiritPortraitTrig = document.getElementById("btnSpiritPortraitTrigger");
const spiritPortraitFileInput = document.getElementById("spiritPortraitFileInput");
if (btnSpiritPortraitTrig && spiritPortraitFileInput) {
  btnSpiritPortraitTrig.addEventListener("click", () => {
    spiritPortraitFileInput.value = "";
    spiritPortraitFileInput.click();
  });
  spiritPortraitFileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageCropFile(e.target.files[0], "boreal-spirit");
    }
  });
}

// Disparador de Upload de Foto para NPC com Cropper
const btnUploadNpcAvatar = document.getElementById("btnUploadNpcAvatar");
const npcAvatarInput = document.getElementById("npcAvatarInput");
if (btnUploadNpcAvatar && npcAvatarInput) {
  btnUploadNpcAvatar.addEventListener("click", () => {
    npcAvatarInput.value = "";
    npcAvatarInput.click();
  });
  npcAvatarInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageCropFile(e.target.files[0], "npc");
    }
  });
}

// Adaptação para o retrato da ficha Escória de Deus também abrir o cropper
const btnOpenPortrait1 = document.getElementById("btnOpenSheetAvatarModal");
const btnOpenPortrait2 = document.getElementById("btnPortraitTrigger");
if (btnOpenPortrait1) {
  btnOpenPortrait1.addEventListener("click", () => {
    if (borealPortraitFileInput) {
      sheetCropTarget = "ed-char";
      borealPortraitFileInput.value = "";
      borealPortraitFileInput.click();
    }
  });
}
if (btnOpenPortrait2) {
  btnOpenPortrait2.addEventListener("click", () => {
    if (borealPortraitFileInput) {
      sheetCropTarget = "ed-char";
      borealPortraitFileInput.value = "";
      borealPortraitFileInput.click();
    }
  });
}

// ==========================================================================
// CONTROLE DE PÍLULA FLUTUANTE E INDICADOR DESLIZANTE (MOBILE)
// ==========================================================================
function showSheetMobilePill() {
  const bottomNav = document.getElementById("mobileBottomNav");
  if (bottomNav) bottomNav.style.display = "none";

  const borealPill = document.getElementById("borealMobileColumnPill");
  if (borealPill) borealPill.style.display = "";

  const edPill = document.getElementById("edMobileColumnPill");
  if (edPill) edPill.style.display = "";

  requestAnimationFrame(() => {
    updateBorealPillIndicator();
    updateEdPillIndicator();
  });
}

// Indicadores deslizantes suaves para as pílulas móveis da ficha
// (Usa getComputedStyle e offsetLeft/offsetWidth pois elementos position:fixed têm offsetParent === null)
export function updateBorealPillIndicator() {
  const nav = document.getElementById("borealMobileColumnPill");
  const indicator = document.getElementById("borealPillIndicator");
  if (!nav || !indicator) return;

  const navStyle = window.getComputedStyle(nav);
  if (navStyle.display === "none" || navStyle.visibility === "hidden" || window.innerWidth > 768) {
    indicator.style.opacity = "0";
    return;
  }

  const activeBtn = nav.querySelector(".boreal-pill-tab.active");
  if (!activeBtn || window.getComputedStyle(activeBtn).display === "none") {
    indicator.style.opacity = "0";
    return;
  }

  const left = activeBtn.offsetLeft;
  const width = activeBtn.offsetWidth;
  if (width === 0) {
    requestAnimationFrame(updateBorealPillIndicator);
    return;
  }

  indicator.style.transform = `translate3d(${left}px, 0, 0)`;
  indicator.style.width = `${width}px`;
  indicator.style.opacity = "1";
}

export function updateEdPillIndicator() {
  const nav = document.getElementById("edMobileColumnPill");
  const indicator = document.getElementById("edPillIndicator");
  if (!nav || !indicator) return;

  const navStyle = window.getComputedStyle(nav);
  if (navStyle.display === "none" || navStyle.visibility === "hidden" || window.innerWidth > 768) {
    indicator.style.opacity = "0";
    return;
  }

  const activeBtn = nav.querySelector(".ed-pill-tab.active");
  if (!activeBtn || window.getComputedStyle(activeBtn).display === "none") {
    indicator.style.opacity = "0";
    return;
  }

  const left = activeBtn.offsetLeft;
  const width = activeBtn.offsetWidth;
  if (width === 0) {
    requestAnimationFrame(updateEdPillIndicator);
    return;
  }

  indicator.style.transform = `translate3d(${left}px, 0, 0)`;
  indicator.style.width = `${width}px`;
  indicator.style.opacity = "1";
}

window.updateBorealPillIndicator = updateBorealPillIndicator;
window.updateEdPillIndicator = updateEdPillIndicator;

window.addEventListener("resize", () => {
  updateBorealPillIndicator();
  updateEdPillIndicator();
});

if (typeof ResizeObserver !== "undefined") {
  const borealPillEl = document.getElementById("borealMobileColumnPill");
  if (borealPillEl) {
    new ResizeObserver(() => updateBorealPillIndicator()).observe(borealPillEl);
  }
  const edPillEl = document.getElementById("edMobileColumnPill");
  if (edPillEl) {
    new ResizeObserver(() => updateEdPillIndicator()).observe(edPillEl);
  }
}

// Engrenagem: Abre Modal Centralizado de Configurações da Ficha Boreal
const btnBorealGear = document.getElementById("btnBorealGearMenu");
if (btnBorealGear) {
  btnBorealGear.addEventListener("click", (e) => {
    e.stopPropagation();
    openModalById("modalBorealSheetSettings");
  });
}

const borealAccentPicker = document.getElementById("borealSheetAccentPicker");
if (borealAccentPicker) {
  borealAccentPicker.addEventListener("input", (e) => {
    const col = e.target.value;
    applyBorealAccent(col);
    if (currentViewingSheet) currentViewingSheet.accentColor = col;
    triggerBorealAutoSave();
  });
}

const btnBorealToggleTheme = document.getElementById("btnBorealToggleTheme");
if (btnBorealToggleTheme) {
  btnBorealToggleTheme.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("veu_theme", nextTheme);
    showToast(`Tema alterado para ${nextTheme.toUpperCase()}`, "info");
  });
}

// Responsividade: Desktop Médio e Pílula Mobile Boreal
const btnBorealMedPrev = document.getElementById("btnBorealMedPrevCols");
const btnBorealMedNext = document.getElementById("btnBorealMedNextCols");
const borealMedIndicator = document.getElementById("borealMedNavIndicator");
const borealSheetBody = document.getElementById("borealSheetBody");

if (btnBorealMedPrev && borealSheetBody) {
  btnBorealMedPrev.addEventListener("click", () => {
    borealSheetBody.setAttribute("data-active-view", "1-2");
    if (borealMedIndicator) borealMedIndicator.textContent = "Colunas 1 & 2";
  });
}
if (btnBorealMedNext && borealSheetBody) {
  btnBorealMedNext.addEventListener("click", () => {
    borealSheetBody.setAttribute("data-active-view", "2-3");
    if (borealMedIndicator) borealMedIndicator.textContent = "Colunas 2 & 3";
  });
}

const borealPillTabs = document.querySelectorAll(".boreal-pill-tab[data-bcol]");
borealPillTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const bcol = tab.getAttribute("data-bcol");
    if (!bcol) return;
    if (borealSheetBody) borealSheetBody.setAttribute("data-active-mobile", bcol);
    borealPillTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    updateBorealPillIndicator();
  });
});

// Auto-save e Salvar Manual da Ficha Boreal RPG
async function saveBorealSheet(isAuto = false) {
  if (!currentViewingSheet || !activeCampaign) return;

  const charName = document.getElementById("borealCharName")?.value.trim() || currentViewingSheet.name || "Aventureiro";
  const charClass = document.getElementById("borealCharClass")?.value.trim() || currentViewingSheet.class || currentViewingSheet.characterClass || "Iniciado";
  const age = document.getElementById("borealFieldAge")?.value.trim() ?? currentViewingSheet.age ?? "";
  const level = parseInt(document.getElementById("borealCharLevel")?.value, 10) || parseInt(document.getElementById("borealFieldCharLevel")?.value, 10) || currentViewingSheet.level || 1;

  const currencies = {
    rubi: Math.max(0, parseInt(document.getElementById("borealCoinRubi")?.value, 10) || 0),
    ouro: Math.max(0, parseInt(document.getElementById("borealCoinOuro")?.value, 10) || 0),
    prata: Math.max(0, parseInt(document.getElementById("borealCoinPrata")?.value, 10) || 0),
    bronze: Math.max(0, parseInt(document.getElementById("borealCoinBronze")?.value, 10) || 0)
  };
  const accentColor = currentViewingSheet.accentColor || "#3b82f6";

  const corpo = parseInt(document.getElementById("borealAttrCorpo")?.value, 10) || 0;
  const poder = parseInt(document.getElementById("borealAttrPoder")?.value, 10) || 0;
  const mente = parseInt(document.getElementById("borealAttrMente")?.value, 10) || 0;

  // Atualiza dados do Espírito com campos do drawer
  const sp = currentViewingSheet.spirit || {};
  sp.nome = document.getElementById("spiritFieldNome")?.value.trim() || document.getElementById("borealFieldSpirit")?.value.trim() || sp.nome || "Espírito Guardião";
  sp.nivel = parseInt(document.getElementById("spiritFieldNivel")?.value, 10) || sp.nivel || 1;
  sp.tipo = document.getElementById("spiritFieldTipo")?.value.trim() || document.getElementById("borealHeaderSpiritSelect")?.value.trim() || sp.tipo || "Sabedoria";
  sp.dtFisico = parseInt(document.getElementById("spiritDtFisico")?.value, 10) || sp.dtFisico || 6;
  sp.dtMagico = parseInt(document.getElementById("spiritDtMagico")?.value, 10) || sp.dtMagico || 6;
  sp.dtMental = parseInt(document.getElementById("spiritDtMental")?.value, 10) || sp.dtMental || 6;
  sp.attrCorpo = parseInt(document.getElementById("spiritAttrCorpo")?.value, 10) || sp.attrCorpo || 1;
  sp.attrPoder = parseInt(document.getElementById("spiritAttrPoder")?.value, 10) || sp.attrPoder || 1;
  sp.attrMente = parseInt(document.getElementById("spiritAttrMente")?.value, 10) || sp.attrMente || 1;
  sp.aparencia = document.getElementById("spiritDescAparencia")?.value.trim() || sp.aparencia || "";
  sp.personalidade = document.getElementById("spiritDescPersonalidade")?.value.trim() || sp.personalidade || "";
  sp.habitos = document.getElementById("spiritDescHabitos")?.value.trim() || sp.habitos || "";

  const payload = {
    name: charName,
    firstName: charName.split(" ")[0] || charName,
    lastName: charName.split(" ").slice(1).join(" ") || "",
    class: charClass,
    characterClass: charClass,
    age,
    level,
    currencies,
    accentColor,
    avatarUrl: currentViewingSheet.avatarUrl || "",
    system: "Boreal RPG",
    attributes: { corpo, poder, mente },
    skills: currentViewingSheet.skills || {},
    hpCurrent: currentViewingSheet.hpCurrent ?? 10,
    hpMax: currentViewingSheet.hpMax ?? 10,
    resCurrent: currentViewingSheet.resCurrent ?? 10,
    resMax: currentViewingSheet.resMax ?? 10,
    protCurrent: currentViewingSheet.protCurrent ?? 0,
    protMax: currentViewingSheet.protMax ?? 0,
    protBase: currentViewingSheet.protBase ?? 0,
    equippedSlots: currentViewingSheet.equippedSlots || {},
    backpack: currentViewingSheet.backpack || [],
    classSkills: currentViewingSheet.classSkills || [],
    potions: currentViewingSheet.potions || [],
    amulets: currentViewingSheet.amulets || [],
    spirit: sp,
    updatedAt: serverTimestamp()
  };

  try {
    const btnSave = document.getElementById("btnSaveSheetChanges");
    if (!isAuto && btnSave) {
      btnSave.disabled = true;
      btnSave.innerHTML = `<span class="btn-spinner"></span> <span>Salvando...</span>`;
    }

    await updateDoc(doc(db, "campaigns", activeCampaign.id, "sheets", currentViewingSheet.id), payload);
    currentViewingSheet = { ...currentViewingSheet, ...payload };

    const cachedIdx = campaignSheetsCache.findIndex((s) => s.id === currentViewingSheet.id);
    if (cachedIdx !== -1) {
      campaignSheetsCache[cachedIdx] = { ...campaignSheetsCache[cachedIdx], ...payload };
      if (!isAuto) {
        renderSheets();
      }
    }

    if (!isAuto) {
      showToast("Ficha do Boreal RPG salva com sucesso!", "success");
    }
  } catch (err) {
    console.error("Erro ao salvar Ficha Boreal RPG:", err);
    if (!isAuto) {
      showToast("Erro ao salvar ficha: " + err.message, "error");
    }
  } finally {
    const btnSave = document.getElementById("btnSaveSheetChanges");
    if (!isAuto && btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
          <polyline points="17 21 17 13 7 13 7 21"></polyline>
          <polyline points="7 3 7 8 15 8"></polyline>
        </svg>
        <span>Salvar Ficha</span>
      `;
    }
  }
}

