import { z } from "zod";

import {
  RspPublicCommandError,
  rspZodIssues,
  type RspFieldIssue,
} from "../contracts/issues";

type TaskOperation = "describe" | "finalize" | "check" | "commit";

const prepareIssue = (error: unknown): RspFieldIssue => {
  const message = error instanceof Error ? error.message : "";
  if (/scene template|scene task compile/iu.test(message)) {
    return {
      path: "$.storyId",
      code: "rsp-prepare-scene-template-failed",
      message: "A configured Scene template failed fixed preparation.",
      ownerAction:
        "Do not retry this stopped lifecycle. Update AXMORF Studio to a compatible Runtime Pack, then start a new prepare attempt.",
    };
  }
  if (/narration|audio|ffmpeg|ffprobe|pcm|wav/iu.test(message)) {
    return {
      path: "$.storyId",
      code: "rsp-prepare-narration-failed",
      message: "Narration failed fixed preparation or validation.",
      ownerAction:
        "Do not retry this stopped lifecycle. Preserve rsp inspect output and verify the installed Runtime Pack before starting a new prepare attempt.",
    };
  }
  return {
    path: "$.storyId",
    code: "rsp-prepare-internal-failed",
    message: "Production preparation failed before completion.",
    ownerAction:
      "Do not retry this stopped lifecycle. Preserve rsp inspect output and report this issue code before starting a new prepare attempt.",
  };
};

const taskIssue = ({
  operation,
  error,
}: {
  readonly operation: TaskOperation;
  readonly error: unknown;
}): RspFieldIssue => {
  const message = error instanceof Error ? error.message : "";
  const ownerAction =
    "Read inputs/task-contract.json, correct only declared output paths, then rerun rsp task finalize and rsp task check.";
  if (/Renderer transform must be statically provable/iu.test(message)) {
    return {
      path: "$.outputs[src/Renderer.tsx]",
      code: "rsp-task-renderer-transform-unprovable",
      message:
        "Renderer transform or scale is computed dynamically and cannot be proven readable.",
      ownerAction:
        "Remove frame-computed transform and scale values. Use frame-driven opacity, top, left, width, or height for motion, then rerun finalize and check.",
    };
  }
  if (
    /Renderer scale must be statically proven not to shrink/iu.test(message)
  ) {
    return {
      path: "$.outputs[src/Renderer.tsx]",
      code: "rsp-task-renderer-scale-unreadable",
      message:
        "Renderer scale can shrink readable content below its frozen size.",
      ownerAction:
        "Remove the shrinking scale or use a static scale of at least 1, then rerun finalize and check.",
    };
  }
  if (/Visible text font size .*not statically provable/iu.test(message)) {
    return {
      path: "$.outputs[src/Renderer.tsx]",
      code: "rsp-task-text-size-unprovable",
      message:
        "Visible text must declare a statically provable pixel font size.",
      ownerAction:
        "Set an explicit numeric pixel fontSize on every visible native text element, then rerun finalize and check.",
    };
  }
  const undersizedText = message.match(
    /Visible text size ([0-9.]+)px is below the frozen ([0-9.]+)px minimum/iu,
  );
  if (undersizedText !== null) {
    return {
      path: "$.outputs[src/Renderer.tsx]",
      code: "rsp-task-text-size-below-minimum",
      message: `Visible text size ${undersizedText[1]}px is below the frozen ${undersizedText[2]}px minimum.`,
      ownerAction:
        "Increase that visible text fontSize to the stated minimum or larger, then rerun finalize and check.",
    };
  }
  if (/GlobalVisual source crosses its visual-only boundary/iu.test(message)) {
    return {
      path: "$.outputs[src/GlobalVisualLayers.tsx]",
      code: "rsp-task-global-visual-boundary-invalid",
      message:
        "A GlobalVisual base or decoration layer contains visible text or shared Scene, caption, narration, audio, or network ownership.",
      ownerAction:
        "Keep GlobalVisualBaseLayer and GlobalVisualDecorationLayers visual-only and text-free; remove the named shared-boundary usage, then rerun finalize and check.",
    };
  }
  if (/GlobalVisual entry must use the Remotion frame API/iu.test(message)) {
    return {
      path: "$.outputs[src/GlobalVisualLayers.tsx]",
      code: "rsp-task-global-visual-frame-api-missing",
      message:
        "GlobalVisualDecorationLayers must use useCurrentFrame for motion.",
      ownerAction:
        "Import and call useCurrentFrame in GlobalVisualDecorationLayers, then rerun finalize and check.",
    };
  }
  if (/GlobalVisual root must declare pointerEvents none/iu.test(message)) {
    return {
      path: "$.outputs[src/GlobalVisualLayers.tsx]",
      code: "rsp-task-global-visual-pointer-events-missing",
      message:
        "GlobalVisualBaseLayer and GlobalVisualDecorationLayers roots must declare pointerEvents none.",
      ownerAction:
        'Set pointerEvents: "none" on both root styles, then rerun finalize and check.',
    };
  }
  if (/missing|ambiguous|unsafe|exact file set/iu.test(message)) {
    return {
      path: "$.workspace",
      code: "rsp-task-workspace-invalid",
      message: "Task workspace files do not match the exact task authority.",
      ownerAction,
    };
  }
  if (
    /network|css animation|css transition|forbidden|boundary/iu.test(message)
  ) {
    return {
      path: "$.outputs",
      code: "rsp-task-policy-invalid",
      message: "Task output violates a fixed runtime or ownership policy.",
      ownerAction,
    };
  }
  if (/source|compile|component|renderer|cover|globalvisual/iu.test(message)) {
    return {
      path: "$.outputs",
      code: "rsp-task-source-invalid",
      message:
        "Task source does not satisfy its fixed component or source contract.",
      ownerAction,
    };
  }
  if (
    /fingerprint|stale|identity|order|resource|plan|receipt|selection/iu.test(
      message,
    )
  ) {
    return {
      path: "$.outputs",
      code: "rsp-task-contract-invalid",
      message:
        "Task artifacts do not satisfy their frozen identity or cross-file contract.",
      ownerAction,
    };
  }
  return {
    path: "$.outputs",
    code: `rsp-task-${operation}-failed`,
    message: `Task ${operation} failed fixed validation.`,
    ownerAction,
  };
};

export const publicTaskCommandError = ({
  operation,
  error,
}: {
  readonly operation: TaskOperation;
  readonly error: unknown;
}) => {
  const issues =
    error instanceof z.ZodError
      ? rspZodIssues({
          error,
          codePrefix: "rsp-task-contract",
          ownerAction:
            "Correct the named output field, rerun rsp task finalize, then rerun rsp task check.",
        })
      : [taskIssue({ operation, error })];
  return new RspPublicCommandError(
    "rsp-command-failed",
    `Task ${operation} failed fixed validation.`,
    issues,
  );
};

export const publicPrepareCommandError = (error: unknown) => {
  const failure = new RspPublicCommandError(
    "rsp-command-failed",
    "Production preparation failed.",
    [prepareIssue(error)],
  );
  Object.defineProperty(failure, "cause", {
    value: error,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return failure;
};
