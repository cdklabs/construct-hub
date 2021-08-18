/**
 * The CodeArtifact repository API exposed to extensions.
 */
export interface IRepository {
  /**
   * Adds an external connection to this repository.
   *
   * @param id the id of the external connection (i.e: `public:npmjs`).
   */
  addExternalConnection(id: string): void;
}
