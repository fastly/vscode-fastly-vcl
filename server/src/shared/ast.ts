export interface ASTNode {
  type: string;
  [key: string]: any;
}

export function walkAST(astJSON: ASTNode, callback: (node: ASTNode) => void) {
  callback(astJSON);

  for (const key in astJSON) {
    if (
      key !== "type" &&
      typeof astJSON[key] === "object" &&
      astJSON[key] !== null
    ) {
      if (Array.isArray(astJSON[key])) {
        astJSON[key].forEach((item: ASTNode) => {
          if (typeof item === "object" && item !== null) {
            walkAST(item, callback);
          }
        });
      } else {
        walkAST(astJSON[key], callback);
      }
    }
  }
}
