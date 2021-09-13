/**
 * Supported languages to generate documentation in.
 */
export class DocumentationLanguage {
  /**
   * TypeScript.
   */
  public static readonly TYPESCRIPT = new DocumentationLanguage('typescript');

  /**
   * Python.
   */
  public static readonly PYTHON = new DocumentationLanguage('python');

  /**
   * Java.
   */
  public static readonly JAVA = new DocumentationLanguage('java');

  /**
   * All supported languages.
   */
  public static readonly ALL = [
    DocumentationLanguage.TYPESCRIPT,
    DocumentationLanguage.PYTHON,
    DocumentationLanguage.JAVA,
  ] as const;

  /**
   * Transform a literal string to the `DocumentationLanguage` object.
   *
   * Throws an `UnsupportedLanguageError` if the language is not supported.
   */
  public static fromString(lang: string) {
    switch (lang) {
      case DocumentationLanguage.TYPESCRIPT.toString():
        return DocumentationLanguage.TYPESCRIPT;
      case DocumentationLanguage.PYTHON.toString():
        return DocumentationLanguage.PYTHON;
      case DocumentationLanguage.JAVA.toString():
        return DocumentationLanguage.JAVA;
      default:
        throw new UnsupportedLanguageError(lang, DocumentationLanguage.ALL);
    }
  }

  private constructor(private readonly lang: string) {}

  public toString() {
    return this.lang;
  }
}

export class UnsupportedLanguageError extends Error {
  constructor(lang: string, supported: readonly DocumentationLanguage[]) {
    super(`Unsupported language: ${lang}. Supported languages are: [${supported}]`);
  }
}
