/**
 * EXPOSITORES.COM — init.js
 * Exposición global (window.*) e inicialización (DOMContentLoaded). Carga al final del <body>.
 * Dependencias: TODOS los módulos anteriores
 */

// ==========================================
// 23. EXPOSICIÓN GLOBAL DE FUNCIONES (window.*) + INIT
// [EDITABLE: si agregas una función llamada desde onclick en HTML, expórtala aquí]
// ==========================================
window.bazaarCanvas                 = bazaarCanvas;
window.switchTab                     = switchTab;
window.toggleSocialFabMenu           = toggleSocialFabMenu;
window.toggleDarkMode                = toggleDarkMode;
window.setThemeMode                  = setThemeMode;
window.setThemeColor                 = setThemeColor;
window.toggleSettingsMenu            = toggleSettingsMenu;
window.setActiveBazaarColor          = setActiveBazaarColor;
window.addSuggestedCatalog           = addSuggestedCatalog;
window.updateExpositorMesaTipo       = updateExpositorMesaTipo;
window.updateExpositorColorFields    = updateExpositorColorFields;
window.pickExpositorColor            = pickExpositorColor;
window.renderExpositorColorSwatches  = renderExpositorColorSwatches;
window.applySuggestedBaseCost        = applySuggestedBaseCost;
window.useGlobalBaseCost             = useGlobalBaseCost;
window.refreshExpositorTablePicker   = refreshExpositorTablePicker;
window.updateTableSharedFields       = updateTableSharedFields;
window.syncTableColorToOwner          = syncTableColorToOwner;
window.openTableOwnerPicker          = openTableOwnerPicker;
window.closeTableOwnerPicker         = closeTableOwnerPicker;
window.applyGlobalTablePricesToExpositores = applyGlobalTablePricesToExpositores;
window.toggleGlobalPrices            = toggleGlobalPrices;
window.toggleBackupMenu              = toggleBackupMenu;
window.exportarJSON                  = exportarJSON;
window.exportarJSONCompleto           = exportarJSONCompleto;
window.exportarCSV                   = exportarCSV;
window.handleImportJSON              = handleImportJSON;
window.handleSearch                  = handleSearch;
window.setFilterCategory             = setFilterCategory;
window.setFilterStatus               = setFilterStatus;
window.setFilterExpositorDay         = setFilterExpositorDay;
window.setExpositorSort              = setExpositorSort;
window.openModalExpositor            = openModalExpositor;
window.openModalExpositorForCurrentCategory = openModalExpositorForCurrentCategory;
window.prepareExpositorWizard        = prepareExpositorWizard;
window.nextExpositorStep             = nextExpositorStep;
window.previousExpositorStep         = previousExpositorStep;
window.closeModal                    = closeModal;
window.openNoteEditor                = openNoteEditor;
window.saveNoteHandler               = saveNoteHandler;
window.appAlert                      = appAlert;
window.appConfirm                    = appConfirm;
window.appPrompt                     = appPrompt;
window.submitAppDialog               = submitAppDialog;
window.cancelAppDialog               = cancelAppDialog;
window.handleFotoUpload              = handleFotoUpload;
window.saveExpositorHandler          = saveExpositorHandler;
window.updateExpositorPaymentFields  = updateExpositorPaymentFields;
window.updateExpositorPaymentPreview = updateExpositorPaymentPreview;
window.updateExpositorChairPreview   = updateExpositorChairPreview;
window.updateExpositorCostPreview    = updateExpositorCostPreview;
window.updateExpositorExtraChairFields = updateExpositorExtraChairFields;
window.updateExpositorAreaStaff      = updateExpositorAreaStaff;
window.updateExpositorTableSelection = updateExpositorTableSelection;
window.togglePaymentStatus           = togglePaymentStatus;
window.deleteExpositor               = deleteExpositor;
window.openModalCategoria            = openModalCategoria;
window.setCategoriaManagementTab      = setCategoriaManagementTab;
window.saveCategoriaHandler          = saveCategoriaHandler;
window.deleteCategoria               = deleteCategoria;
window.deleteCaracteristica          = deleteCaracteristica;
window.openCaracteristicas           = openCaracteristicas;
window.updateExpositorCaracteristicas = updateExpositorCaracteristicas;
window.generatePDFInvoice            = generatePDFInvoice;
window.updateEventCostsUI            = updateEventCostsUI;
window.addExtraCostRow               = addExtraCostRow;
window.updateExtraCost               = updateExtraCost;
window.removeExtraCostRow            = removeExtraCostRow;
window.switchBazaar                  = switchBazaar;
window.switchFloor                   = switchFloor;
window.renameCurrentFloor            = renameCurrentFloor;
window.addFloor                      = addFloor;
window.deleteCurrentFloor            = deleteCurrentFloor;
window.createBazaar                  = createBazaar;
window.deleteBazaarById              = deleteBazaarById;
window.switchBazaarAndGo             = switchBazaarAndGo;
window.renameBazaar                  = renameBazaar;
window.renderBazaresTabla            = renderBazaresTabla;
window.renderBazaarHome               = renderBazaarHome;
window.renderComparaBazares          = renderComparaBazares;
window.openLogoUploadModal           = openLogoUploadModal;
window.openBazaarColorModal          = openBazaarColorModal;
window.pickBazaarColor               = pickBazaarColor;
window.clearBazaarColor              = clearBazaarColor;
window.saveBazaarColor               = saveBazaarColor;
window.toggleMultiDia                = toggleMultiDia;
window.addDiaEvento                  = addDiaEvento;
window.updateDiaEvento               = updateDiaEvento;
window.removeDiaEvento               = removeDiaEvento;
window.updateExpositorDias           = updateExpositorDias;
window.handleLogoUpload              = handleLogoUpload;
window.saveLogoHandler               = saveLogoHandler;
window.removeLogoHandler             = removeLogoHandler;
window.zoomBazaar                    = zoomBazaar;
window.resetBazaarZoom               = resetBazaarZoom;
window.resetBazaarCanvas             = resetBazaarCanvas;
window.setCanvasMode                 = setCanvasMode;
window.toggleLayer                   = toggleLayer;
window.toggleSnapTables              = toggleSnapTables;
window.toggleLegend                  = toggleLegend;
window.autoNumberTables              = autoNumberTables;
window.openModalZoneEdit              = openModalZoneEdit;
window.saveZoneEdit                   = saveZoneEdit;
window.deleteZoneFromModal            = deleteZoneFromModal;
window.exportZonesJSON               = exportZonesJSON;
window.clearAllZones                 = clearAllZones;
window.confirmDeleteZone             = confirmDeleteZone;
window.exportarMapaPDF               = exportarMapaPDF;
window.updateMapScale                = updateMapScale;
window.handleFloorPlanUpload         = handleFloorPlanUpload;
window.addTableToCore                = addTableToCore;
window.deleteTable                   = deleteTable;
window.deleteSelectedMapObject       = deleteSelectedMapObject;
window.saveTableEdit                 = saveTableEdit;
window.rotateEditingTable             = rotateEditingTable;
window.rotateSelectedTable             = rotateSelectedTable;
window.updateFloorPlanOpacity          = updateFloorPlanOpacity;
window.updateFloorPlanScale            = updateFloorPlanScale;
window.moveFloorPlan                   = moveFloorPlan;
window.rotateFloorPlan                 = rotateFloorPlan;
window.addMapElement                   = addMapElement;
window.updateNewElementEmoji            = updateNewElementEmoji;
window.saveNewMapElement                = saveNewMapElement;
window.openModalMapElementEdit         = openModalMapElementEdit;
window.saveMapElementEdit              = saveMapElementEdit;
window.deleteMapElementFromModal       = deleteMapElementFromModal;
window.toggleOtherTableCount           = toggleOtherTableCount;
window.toggleAttendance              = toggleAttendance;
window.setTableAttendance            = setTableAttendance;
window.openExpositorChecklist        = openExpositorChecklist;
window.toggleExpositorChecklistItem  = toggleExpositorChecklistItem;
window.editChecklistItemLabel        = editChecklistItemLabel;
window.addExpositorChecklistItem     = addExpositorChecklistItem;
window.removeExpositorChecklistItem  = removeExpositorChecklistItem;
window.guardarComoPlantilla          = guardarComoPlantilla;
window.renderPlantillas              = renderPlantillas;
window.usarPlantilla                 = usarPlantilla;
window.eliminarPlantilla             = eliminarPlantilla;
window.openModalInvitado             = openModalInvitado;
window.saveInvitadoHandler           = saveInvitadoHandler;
window.toggleInvConfirmado           = toggleInvConfirmado;
window.toggleInvAsistio              = toggleInvAsistio;
window.deleteInvitado                = deleteInvitado;
window.cyclePublicationStatus          = cyclePublicationStatus;
window.toggleExpositorBan              = toggleExpositorBan;
window.addMinuteRow                    = addMinuteRow;
window.updateMinuteRow                 = updateMinuteRow;
window.deleteMinuteRow                 = deleteMinuteRow;
window.setMinutoDia                    = setMinutoDia;
window.duplicateCurrentFloor           = duplicateCurrentFloor;
window.saveDuplicarPlano               = saveDuplicarPlano;
window.setFloorDia                     = setFloorDia;
window.setDiaEventoDia                 = setDiaEventoDia;
window.exportarMinutoAMinutoCSV        = exportarMinutoAMinutoCSV;
window.exportarMinutoAMinutoPDF        = exportarMinutoAMinutoPDF;
window.updateCharts                   = updateCharts;
window.duplicarBazaar                  = duplicarBazaar;
window.updateMapOrientation            = updateMapOrientation;
window.setExpositorView                = setExpositorView;
window.openHistorial                   = openHistorial;
window.clearHistorial                  = clearHistorial;
window.renderPanelDiaEvento            = renderPanelDiaEvento;
window.enterPresentationMode           = enterPresentationMode;
window.exitPresentationMode            = exitPresentationMode;
window.changePresentationFloor        = changePresentationFloor;
window.renderAlertas                   = renderAlertas;
window.setStaffSearch                 = setStaffSearch;
window.setStaffRoleFilter             = setStaffRoleFilter;
window.updateAlertBadge                = updateAlertBadge;
window.renderMetricasFinancieras       = renderMetricasFinancieras;
window.renderMetricasResumenGeneral    = renderMetricasResumenGeneral;
window.openBackupExport                = openBackupExport;
window.renderBackupExportSections      = renderBackupExportSections;
window.backupExportSeleccionar         = backupExportSeleccionar;
window.backupExportRefresh             = backupExportRefresh;
window.ejecutarExportacionBazar        = ejecutarExportacionBazar;
window.backupImportSourceChanged       = backupImportSourceChanged;
window.backupImportSeleccionar         = backupImportSeleccionar;
window.backupImportRefresh             = backupImportRefresh;
window.ejecutarImportacion             = ejecutarImportacion;
window.reemplazarTodaLaApp             = reemplazarTodaLaApp;
window.renderResponsables              = renderResponsables;
window.openModalRol                    = openModalRol;
window.saveRolHandler                  = saveRolHandler;
window.deleteRol                       = deleteRol;
window.openModalResponsable            = openModalResponsable;
window.saveResponsableHandler          = saveResponsableHandler;
window.deleteResponsable               = deleteResponsable;
window.renderFicha                     = renderFicha;
window.updateFichaField                = updateFichaField;
window.renderFichaResumen              = renderFichaResumen;
window.setTareasFase                   = setTareasFase;
window.addTarea                        = addTarea;
window.updateTarea                     = updateTarea;
window.toggleTarea                     = toggleTarea;
window.deleteTarea                     = deleteTarea;
window.addCompra                       = addCompra;
window.updateCompra                    = updateCompra;
window.toggleCompra                    = toggleCompra;
window.deleteCompra                    = deleteCompra;
window.enviarCompraAPresupuesto        = enviarCompraAPresupuesto;
window.enviarComprasAPresupuesto       = enviarComprasAPresupuesto;
window.exportarPlanEventoXLSX          = exportarPlanEventoXLSX;
window.renderFicha                     = renderFicha;
window.updateFichaField                = updateFichaField;
window.setTareasFase                   = setTareasFase;
window.renderTareas                    = renderTareas;
window.addTarea                        = addTarea;
window.updateTarea                     = updateTarea;
window.toggleTarea                     = toggleTarea;
window.deleteTarea                     = deleteTarea;
window.renderCompras                   = renderCompras;
window.addCompra                       = addCompra;
window.updateCompra                    = updateCompra;
window.toggleCompra                    = toggleCompra;
window.deleteCompra                    = deleteCompra;
window.enviarCompraAPresupuesto        = enviarCompraAPresupuesto;
window.enviarComprasAPresupuesto       = enviarComprasAPresupuesto;
window.exportarPlanEventoXLSX          = exportarPlanEventoXLSX;

document.addEventListener("DOMContentLoaded", () => {
  renderAll();
  switchTab(getActiveBazaar() ? "bazares" : "inicio");
  bazaarCanvas.init();

  // Cierra modales al hacer clic en el fondo oscuro
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target !== overlay) return;
      if (overlay.id === "modal-app-dialog") cancelAppDialog();
      else if (overlay.id === "modal-expositor") closeModal(overlay.id);
      else overlay.classList.remove("open");
    });
  });

  // Cierra el engranaje ⚙️ al hacer clic fuera (composedPath: el menú se redibuja al elegir una opción)
  document.addEventListener("click", (e) => {
    const menu = document.getElementById("settings-menu");
    if (!menu?.classList.contains("open")) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (path.includes(menu) || path.includes(document.getElementById("btn-settings"))) return;
    menu.classList.remove("open");
    document.getElementById("btn-settings")?.setAttribute("aria-expanded", "false");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.getElementById("settings-menu")?.classList.remove("open");
  });

  // Cierra el menú de respaldo al hacer clic fuera de él
  document.addEventListener("click", (e) => {
    const menu = document.getElementById("backup-menu");
    if (!menu) return;
    if (!menu.contains(e.target) && !e.target.closest('[onclick="toggleBackupMenu()"]')) {
      menu.classList.remove("open");
    }
  });

  document.addEventListener("click", (e) => {
    const socialMenu = document.getElementById("fab-social-menu");
    if (!socialMenu) return;
    if (!socialMenu.contains(e.target) && !e.target.closest(".fab-social")) {
      socialMenu.classList.remove("open");
      socialMenu.setAttribute("aria-hidden", "true");
    }
  });

  // Barra superior: abrir/cerrar menús desplegables (clic/tap), clic fuera y Escape
  document.addEventListener("click", (e) => {
    const label = e.target.closest(".nav-group-label");
    if (label) { toggleNavGroup(label.parentElement); return; }
    if (!e.target.closest(".nav-group")) {
      closeNavGroups();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNavGroups();
  });
  window.toggleNavGroup = toggleNavGroup;
  window.syncTopNav = syncTopNav;

  // Hamburguesa en móvil
  document.querySelector("#btn-toggle-sidebar")?.addEventListener("click", toggleMobileSidebar);
  document.querySelector("#sidebar-overlay")?.addEventListener("click", closeMobileSidebar);
  window.toggleMobileSidebar = toggleMobileSidebar;
  window.closeMobileSidebar = closeMobileSidebar;
});