/**
 * Enforces explicit test section markers:
 *   // arrange
 *   // act
 *   // assert
 * in that strict order for every `it(...)` / `test(...)` callback body.
 */
const MARKER_PATTERN = /^\s*(arrange|act|assert)\s*$/u;

/**
 * Returns true when the call expression is a test case block.
 * @param callee - The call expression callee node.
 * @returns Whether this callee represents `it` or `test`.
 */
function isTestCallee(callee) {
  return (
    callee.type === "Identifier" &&
    (callee.name === "it" || callee.name === "test")
  );
}

const rule = {
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        if (!isTestCallee(node.callee)) {
          return;
        }

        const callback = node.arguments.at(1);
        if (
          !callback ||
          (callback.type !== "ArrowFunctionExpression" &&
            callback.type !== "FunctionExpression")
        ) {
          return;
        }
        if (callback.body.type !== "BlockStatement") {
          context.report({
            message:
              "Test callback must use a block body with // arrange, // act, // assert sections.",
            node: callback,
          });
          return;
        }

        const body = callback.body;
        const comments = sourceCode
          .getAllComments()
          .filter(
            (comment) =>
              comment.range[0] >= body.range[0] &&
              comment.range[1] <= body.range[1],
          );

        let arrangeComment = null;
        let actComment = null;
        let assertComment = null;

        for (const comment of comments) {
          const match = MARKER_PATTERN.exec(comment.value);
          if (!match) {
            continue;
          }
          if (match[1] === "arrange" && arrangeComment === null) {
            arrangeComment = comment;
          } else if (match[1] === "act" && actComment === null) {
            actComment = comment;
          } else if (match[1] === "assert" && assertComment === null) {
            assertComment = comment;
          }
        }

        if (!arrangeComment || !actComment || !assertComment) {
          context.report({
            message:
              "Test must include // arrange, // act, and // assert markers.",
            node: callback,
          });
          return;
        }

        if (
          !(
            arrangeComment.range[0] < actComment.range[0] &&
            actComment.range[0] < assertComment.range[0]
          )
        ) {
          context.report({
            message:
              "Test section markers must appear in order: // arrange, // act, // assert.",
            node: callback,
          });
        }

        const statements = body.body;
        const statementsBeforeArrange = statements.filter(
          (statement) => statement.range[0] < arrangeComment.range[0],
        );
        if (statementsBeforeArrange.length > 0) {
          context.report({
            message:
              "Executable statements are not allowed before the // arrange section.",
            node: statementsBeforeArrange[0],
          });
        }

        const actStatements = statements.filter(
          (statement) =>
            statement.range[0] > actComment.range[1] &&
            statement.range[0] < assertComment.range[0],
        );
        const assertStatements = statements.filter(
          (statement) => statement.range[0] > assertComment.range[1],
        );

        if (statements.length >= 2 && actStatements.length === 0) {
          context.report({
            message:
              "The // act section must contain at least one executable statement for multi-statement tests.",
            node: actComment,
          });
        }
        if (assertStatements.length === 0) {
          context.report({
            message:
              "The // assert section must contain at least one executable statement.",
            node: assertComment,
          });
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Require explicit arrange/act/assert markers in each it/test callback.",
    },
    schema: [],
    type: "problem",
  },
};

export default rule;
