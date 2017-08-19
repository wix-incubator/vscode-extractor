- support typescript/flow config/plugin
- clean code
- add error message: Selected block should represent set of statements or an expression
- babel template doesnt support typescript
- handle:
  get filteredSessionLogs(): ILogRow[] {
    return this.sessionLogs.filter(
      log =>
        (log.template.severity === 'Error' && this.logFilters.error) ||
        (log.template.severity === 'Warning' && this.logFilters.warning) ||
        (log.template.severity === 'Info' && this.logFilters.info)
    )
  }
- handle: spread operator
- handle async/await