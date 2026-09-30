#!/usr/bin/env bash
# FacturaEc a Node 22 — deploy en tandas (generado el 2026-09-30 de functions:list)
# desde saas_facturacion_web_JDC · proyecto accounting-system-a5c9f · NUNCA deploy general (publicaría getAuthToken)
set -euo pipefail
# Correr UNA tanda a la vez, a mano, copiando su línea: si una falla, se lee su log
# antes de seguir. La 4 (pipeline del SRI) al final, y después emitir una factura de
# prueba en la empresa OG4ydEyOAhtsNmkOjc1P (ambiente de pruebas) y comprobar el correo.
# Verificar al terminar: firebase functions:list --project accounting-system-a5c9f --json
#   -> las 81 en nodejs22 (agrupar por "hash" dice qué salió en qué tanda).
# Ojo: cada tanda despliega el código de HEAD de esas functions, no solo el runtime.
cd functions && npm run build && cd ..

# Tanda 1-contabilidad (21)
firebase deploy --project accounting-system-a5c9f --only functions:auditLogAccountingPeriods,functions:auditLogChartOfAccounts,functions:auditLogJournalEntries,functions:closeAccountingPeriod,functions:generateAccountingPdf,functions:generateAts,functions:generateJournalEntryFromCreditNote,functions:generateJournalEntryFromDebitNote,functions:generateJournalEntryFromInvoice,functions:generateJournalEntryFromInvoicePayment,functions:generateJournalEntryFromPurchase,functions:generateJournalEntryFromPurchasePayment,functions:generateJournalEntryFromRetention,functions:generateOpeningEntry,functions:generateReversalFromDebitNote,functions:generateReversalFromInvoice,functions:generateReversalFromPurchase,functions:generateReversalFromRetention,functions:regenerateJournalEntry,functions:runDepreciationForMonth,functions:runMonthlyDepreciation 2>&1 | tee deploy-node22-1-contabilidad.log

# Tanda 2-otros (15)
firebase deploy --project accounting-system-a5c9f --only functions:detectOverdueTasksScheduled,functions:downloadDocument,functions:generateWeeklyReport,functions:onMarketplaceSettingsChange,functions:onPosSaleComplete,functions:onProductPublicSync,functions:onPurchaseReceive,functions:onTaskStatusChanged,functions:onTimesheetCreated,functions:onTimesheetDeleted,functions:schoolConfirmRecharge,functions:schoolGenerateStudentQr,functions:schoolProcessPurchase,functions:schoolScanQr,functions:serveApiDocs 2>&1 | tee deploy-node22-2-otros.log

# Tanda 3-empresas-usuarios-portal (25)
firebase deploy --project accounting-system-a5c9f --only functions:portalGetCompany,functions:portalGetSmtp,functions:portalListCompanies,functions:portalListPackages,functions:portalListPlans,functions:portalSaveSmtp,functions:portalSetAddon,functions:portalSetCompanyStatus,functions:portalUpdateCompany,functions:portalUpsertPlan,functions:portalWhoAmI,functions:manageChannelAdmin,functions:assignPlanToCompany,functions:checkPlanLimit,functions:onPlanUpdated,functions:setUserCustomClaims,functions:setupFirstAdmin,functions:setupCompany,functions:createCompanyUser,functions:updateCompanyUser,functions:deleteCompanyUser,functions:exchangeToken,functions:saveCompanySmtp,functions:uploadCertificate,functions:backfillNotRequiredInvoices 2>&1 | tee deploy-node22-3-empresas-usuarios-portal.log

# Tanda 4-pipeline-sri (20)
firebase deploy --project accounting-system-a5c9f --only functions:createAndEmitInvoice,functions:onInvoiceEmit,functions:onInvoiceStock,functions:onRetentionEmit,functions:onDebitNoteEmit,functions:signXml,functions:sendToSri,functions:checkSriStatus,functions:generateInvoiceXml,functions:generateCreditNoteXml,functions:generateDebitNoteXml,functions:generateRetentionXml,functions:generatePdf,functions:generateCreditNotePdf,functions:generateDebitNotePdf,functions:generateRetentionPdf,functions:sendInvoiceEmail,functions:sendCreditNoteEmail,functions:sendDebitNoteEmail,functions:sendRetentionEmail 2>&1 | tee deploy-node22-4-pipeline-sri.log
