// Public surface of the billing module.
// Other modules must import from this file, not from internal paths.

module.exports = {
  // Routers
  projectsRoutes: require('./projects.routes'),
  clientsRoutes: require('./clients.routes'),
  invoicesRoutes: require('./invoices.routes'),
  creditNotesRoutes: require('./creditNotes.routes'),
  suppliersRoutes: require('./suppliers.routes'),

  // Services (functions consumed by other modules)
  projectService: require('./project.service'),
  invoiceService: require('./invoice.service'),
  invoiceGenerationService: require('./invoiceGeneration.service'),
  creditNoteService: require('./creditNote.service'),
};
