/**
 * Enforces explicit test section markers:
 *   // arrange
 *   // act
 *   // assert
 * in that strict order for every `it(...)` / `test(...)` callback body.
 */
const MARKER_PATTERN = /^\s*(arrange|act|assert)\s*$/u;
const TEST_CALLBACK_INDEX = 1;

/**
 * Finds arrange/act/assert comments inside a block.
 * @param sourceCode - ESLint source wrapper.
 * @param body - Test callback block body.
 * @returns The matching arrange, act, and assert comments when present.
 */
function findSectionComments(sourceCode, body) {
  const comments = sourceCode.getCommentsInside(body);
  let arrangeComment;
  let actComment;
  let assertComment;

  for (const comment of comments) {
    const match = MARKER_PATTERN.exec(comment.value);
    if (!match) {
      continue;
    }

    if (match[1] === "arrange" && arrangeComment === undefined) {
      arrangeComment = comment;
      continue;
    }
    if (match[1] === "act" && actComment === undefined) {
      actComment = comment;
      continue;
    }
    if (match[1] === "assert" && assertComment === undefined) {
      assertComment = comment;
    }
  }

  return { actComment, arrangeComment, assertComment };
}

/**
 * Returns whether the markers are present and ordered.
 * @param comments - Discovered section comments.
 * @returns True when the markers exist and are in arrange/act/assert order.
 */
function hasOrderedComments(comments) {
  const { actComment, arrangeComment, assertComment } = comments;
  return Boolean(
    arrangeComment &&
    actComment &&
    assertComment &&
    arrangeComment.range[0] < actComment.range[0] &&
    actComment.range[0] < assertComment.range[0],
  );
}

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

/**
 * Reports a lint error against the callback body.
 * @param context - ESLint rule context.
 * @param node - Node to underline.
 * @param message - Human-readable failure message.
 */
function report(context, node, message) {
  context.report({ message, node });
}

/**
 * Reports statement placement errors around section comments.
 * @param context - ESLint rule context.
 * @param body - Test callback block body.
 * @param comments - Ordered section comments.
 */
function reportStatementPlacement(context, body, comments) {
  const { actComment, arrangeComment, assertComment } = comments;
  const statementsBeforeArrange = body.body.filter((statement) => {
    return statement.range[0] < arrangeComment.range[0];
  });
  if (statementsBeforeArrange.length > 0) {
    report(
      context,
      statementsBeforeArrange[0],
      "Executable statements are not allowed before the // arrange section.",
    );
  }

  const actStatements = body.body.filter((statement) => {
    return (
      statement.range[0] > actComment.range[1] &&
      statement.range[0] < assertComment.range[0]
    );
  });
  const assertStatements = body.body.filter((statement) => {
    return statement.range[0] > assertComment.range[1];
  });

  if (body.body.length >= 2 && actStatements.length === 0) {
    report(
      context,
      actComment,
      "The // act section must contain at least one executable statement for multi-statement tests.",
    );
  }
  if (assertStatements.length === 0) {
    report(
      context,
      assertComment,
      "The // assert section must contain at least one executable statement.",
    );
  }
}

const rule = {
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        if (!isTestCallee(node.callee)) {
          return;
        }

        const callback = node.arguments.at(TEST_CALLBACK_INDEX);
        if (
          !callback ||
          (callback.type !== "ArrowFunctionExpression" &&
            callback.type !== "FunctionExpression")
        ) {
          return;
        }
        if (callback.body.type !== "BlockStatement") {
          report(
            context,
            callback,
            "Test callback must use a block body with // arrange, // act, // assert sections.",
          );
          return;
        }

        const body = callback.body;
        const comments = findSectionComments(sourceCode, body);
        const { actComment, arrangeComment, assertComment } = comments;
        if (!arrangeComment || !actComment || !assertComment) {
          report(
            context,
            callback,
            "Test must include // arrange, // act, and // assert markers.",
          );
          return;
        }

        if (!hasOrderedComments(comments)) {
          report(
            context,
            callback,
            "Test section markers must appear in order: // arrange, // act, // assert.",
          );
          return;
        }

        reportStatementPlacement(context, body, {
          actComment,
          arrangeComment,
          assertComment,
        });
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
