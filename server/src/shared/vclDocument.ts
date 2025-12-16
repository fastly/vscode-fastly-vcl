import {
  TextDocument,
  TextDocumentContentChangeEvent,
  Range,
  Position,
} from "vscode-languageserver-textdocument";

export class VclDocument {
  private _doc: TextDocument;
  private _ast: any;

  constructor(
    uri: string,
    languageId: string,
    version: number,
    content: string,
  ) {
    this._doc = TextDocument.create(uri, languageId, version, content);
  }

  get AST(): any {
    return this._ast;
  }

  set AST(ast: any) {
    this._ast = ast;
  }

  get doc(): TextDocument {
    return this._doc;
  }

  get uri(): string {
    return this._doc.uri;
  }

  set(doc: TextDocument): void {
    this._doc = doc;
  }

  update(changes: TextDocumentContentChangeEvent[], version: number) {
    // TextDocument.update() handles nonsequential changes with mergesort
    this.set(TextDocument.update(this._doc, changes, version));
    return this;
  }

  getText(range?: Range): string {
    return this._doc.getText(range);
  }

  getLineTo(position: Position): string {
    return this._doc.getText({
      start: {
        line: position.line,
        character: 0,
      },
      end: position,
    });
  }

  getLine(position: Position): string {
    return this._doc.getText({
      start: {
        line: position.line,
        character: 0,
      },
      end: {
        line: position.line,
        character: Number.MAX_SAFE_INTEGER,
      },
    });
  }

  *getLines() {
    for (let i = 0; i < this._doc.lineCount; i++) {
      yield this.getLine({ line: i, character: 0 });
    }
  }

  getWord(position: Position): string {
    const line = this.getLine(position);
    const [wordStart] = line
      .slice(0, position.character)
      .match(/[\w\d._-]+$/) || [""];
    const [wordEnd] = line.slice(position.character).match(/^[\w\d._-]+/) || [
      "",
    ];
    return `${wordStart}${wordEnd}`;
  }

  getSubroutine(position: Position): string | null {
    let text = "";
    for (let l = position.line - 1; l >= 0; l--) {
      const line = this.getLine({ line: l, character: 0 });
      text = `${line}${text}`;
      const [_, subroutine] = line.match(/^\s*sub (\w+)\s*{?/) || [];
      if (subroutine) {
        // Remove any quoted strings, so we don't count brackets inside them.
        text.replace(/"([^"]*)"/g, "");
        const openBr = (text.match(/\{/g) || []).length;
        const closeBr = (text.match(/\}/g) || []).length;
        if (openBr > closeBr) {
          return subroutine;
        }
        return null;
      }
    }
    return null;
  }

  getClosingBracePosition(position: Position): Position | null {
    const br = {
      open: 0,
      closed: 0,
    };
    for (let l = position.line; l < this._doc.lineCount; l++) {
      const line = this.getLine({ line: l, character: 0 }).replace(
        /"([^"]*)"/g,
        "",
      );
      br.open += (line.match(/\{/g) || []).length;
      br.closed += (line.match(/\}/g) || []).length;
      if (br.open === br.closed) {
        const closingBraceChar = line.lastIndexOf("}");
        return {
          line: l,
          character: closingBraceChar > 0 ? closingBraceChar : line.length,
        };
      }
    }
    return null;
  }
}
