export class ProjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectValidationError';
  }
}
