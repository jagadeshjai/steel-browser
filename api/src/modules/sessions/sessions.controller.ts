import { CDPService } from "../../services/cdp/cdp.service.js";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getErrors } from "../../utils/errors.js";
import { CreateSessionRequest, SessionDetails, SessionStreamRequest } from "./sessions.schema.js";
import { CookieData } from "../../services/context/types.js";
import { getUrl, getBaseUrl } from "../../utils/url.js";

export const handleLaunchBrowserSession = async (
  server: FastifyInstance,
  request: CreateSessionRequest,
  reply: FastifyReply,
) => {
  try {
    const {
      sessionId,
      proxyUrl,
      userAgent,
      manualSolveCaptcha,
      sessionContext,
      extensions,
      logSinkUrl,
      timezone,
      dimensions,
      isSelenium,
      blockAds,
      extra,
    } = request.body;

    return await server.sessionService.startSession({
      sessionId,
      proxyUrl,
      userAgent,
      manualSolveCaptcha,
      sessionContext: sessionContext as {
        cookies?: CookieData[] | undefined;
        localStorage?: Record<string, Record<string, any>> | undefined;
      },
      extensions,
      logSinkUrl,
      timezone,
      dimensions,
      isSelenium,
      blockAds,
      extra,
    });
  } catch (e: unknown) {
    server.log.error("Failed lauching browser session", e);
    const error = getErrors(e);
    return reply.code(500).send({ success: false, message: error });
  }
};

export const handleExitBrowserSession = async (
  server: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    const sessionDetails = await server.sessionService.endSession();

    reply.send({ success: true, ...sessionDetails });
  } catch (e: unknown) {
    const error = getErrors(e);
    return reply.code(500).send({ success: false, message: error });
  }
};

export const handleGetBrowserContext = async (
  browserService: CDPService,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const context = await browserService.getBrowserState();
  return reply.send(context);
};

export const handleGetSessionDetails = async (
  server: FastifyInstance,
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply,
) => {
  const sessionId = request.params.sessionId;
  if (sessionId !== server.sessionService.activeSession.id) {
    return reply.send({
      id: sessionId,
      createdAt: new Date().toISOString(),
      status: "released",
      duration: 0,
      eventCount: 0,
      timeout: 0,
      creditsUsed: 0,
      websocketUrl: getBaseUrl("ws"),
      debugUrl: getUrl("v1/sessions/debug"),
      debuggerUrl: getUrl("v1/devtools/inspector.html"),
      sessionViewerUrl: getBaseUrl(),
      userAgent: "",
      isSelenium: false,
      proxy: "",
      proxyTxBytes: 0,
      proxyRxBytes: 0,
      solveCaptcha: false,
    } as SessionDetails);
  }

  const session = server.sessionService.activeSession;
  const duration = new Date().getTime() - new Date(session.createdAt).getTime();
  console.log("duration", duration);
  return reply.send({
    ...session,
    duration,
  });
};

export const handleGetSessions = async (server: FastifyInstance, request: FastifyRequest, reply: FastifyReply) => {
  const currentSession = {
    ...server.sessionService.activeSession,
    duration: new Date().getTime() - new Date(server.sessionService.activeSession.createdAt).getTime(),
  };
  const pastSessions = server.sessionService.pastSessions;
  return reply.send([currentSession, ...pastSessions]);
};

export const handleGetSessionStream = async (
  server: FastifyInstance,
  request: SessionStreamRequest,
  reply: FastifyReply,
) => {
  const { showControls, theme, interactive, pageId, pageIndex } = request.query;

  const singlePageMode = !!(pageId || pageIndex);

  // Construct WebSocket URL with page parameters if present
  let wsUrl = getUrl("v1/sessions/cast", "ws");
  if (pageId) {
    wsUrl += `?pageId=${encodeURIComponent(pageId)}`;
  } else if (pageIndex) {
    wsUrl += `?pageIndex=${encodeURIComponent(pageIndex)}`;
  }

  return reply.view("live-session-streamer.ejs", {
    wsUrl,
    showControls,
    theme,
    interactive,
    dimensions: server.sessionService.activeSession.dimensions,
    singlePageMode,
  });
};

export const handleGetSessionLiveDetails = async (
  server: FastifyInstance,
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const pages = await server.cdpService.getAllPages();

    const pagesInfo = await Promise.all(
      pages.map(async (page) => {
        try {
          const pageId = page.target()._targetId;

          const title = await page.title();

          let favicon: string | null = null;
          try {
            favicon = await page.evaluate(() => {
              const iconLink = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
              if (iconLink) {
                const href = iconLink.getAttribute("href");
                if (href?.startsWith("http")) return href;
                if (href?.startsWith("//")) return window.location.protocol + href;
                if (href?.startsWith("/")) return window.location.origin + href;
                return window.location.origin + "/" + href;
              }
              return null;
            });
          } catch (error) {
            console.error("Error getting page favicon:", error);
          }

          return {
            id: pageId,
            url: page.url(),
            title,
            favicon,
          };
        } catch (error) {
          console.error("Error collecting page info:", error);
          return null;
        }
      }),
    );

    const validPagesInfo = pagesInfo.filter((page) => page !== null);

    const browserVersion = await server.cdpService.getBrowserState();

    const browserState = {
      status: server.sessionService.activeSession.status,
      userAgent: server.sessionService.activeSession.userAgent,
      browserVersion,
      initialDimensions: server.sessionService.activeSession.dimensions || { width: 1920, height: 1080 },
      pageCount: validPagesInfo.length,
    };

    return reply.send({
      pages: validPagesInfo,
      browserState,
      websocketUrl: server.sessionService.activeSession.websocketUrl,
      sessionViewerUrl: server.sessionService.activeSession.sessionViewerUrl,
      sessionViewerFullscreenUrl: `${server.sessionService.activeSession.sessionViewerUrl}?showControls=false`,
    });
  } catch (error) {
    console.error("Error getting session state:", error);
    return reply.code(500).send({
      message: "Failed to get session state",
      error: getErrors(error),
    });
  }
};

export const handleInitiateCaptchaSolve = async (
  server: FastifyInstance,
  request: FastifyRequest<{
    Body: {
      taskId: string;
      pageId?: string; // Optional pageId parameter
    };
  }>,
  reply: FastifyReply,
) => {
  try {
    const { taskId, pageId } = request.body;
    if (!taskId) {
      return reply.code(400).send({
        message: "Missing taskId",
        success: false,
      });
    }

    server.log.info(`Initiating captcha solve via event trigger for taskId: ${taskId}, pageId: ${pageId || "default"}`);

    // Get active page
    const pages = await server.cdpService.getAllPages();
    if (!pages.length) {
      server.log.error("No active pages found for captcha solving");
      return reply.code(404).send({
        message: "No active pages found",
        success: false,
      });
    }

    // Default to the first page if pageId is not provided or not found
    let page = pages[0];
    //@ts-ignore
    let targetPageId = page.target()._targetId; // Get ID of the default page

    if (pageId) {
      //@ts-ignore
      const specifiedPage = pages.find((p) => p.target()._targetId === pageId);
      if (specifiedPage) {
        page = specifiedPage;
        targetPageId = pageId; // Use the specified page ID
        server.log.info(`Using specified page with ID: ${pageId} for captcha solving`);
      } else {
        server.log.warn(`Page with ID ${pageId} not found, using default page (first page) with ID: ${targetPageId}`);
      }
    } else {
      server.log.info(`Using default page (first page) with ID: ${targetPageId} for captcha solving`);
    }

    // Check if page is valid
    if (!page) {
      server.log.error("Selected page is invalid");
      return reply.code(500).send({
        message: "Invalid page selected for captcha solving",
        success: false,
      });
    }

    server.log.info(
      `Attempting to trigger and listen for captcha result on page URL: ${page.url()} for taskId: ${taskId}`,
    );

    // Use page.evaluate to dispatch event and listen for result
    const captchaResult = await page.evaluate(
      (taskIdToSolve, timeoutMs) => {
        return new Promise((resolve, reject) => {
          let timeoutId: NodeJS.Timeout | null = null;

          const listener = (event: CustomEvent) => {
            console.log("[CAPTCHA-DEBUG] Received CAPTCHA_SOLVER_RESULT event:", event.detail);
            if (event.detail && event.detail.externalTriggerId === taskIdToSolve) {
              if (timeoutId) clearTimeout(timeoutId);

              //@ts-ignore
              window.removeEventListener("CAPTCHA_SOLVER_RESULT", listener);
              console.log(`[CAPTCHA-DEBUG] Matching result found for taskId: ${taskIdToSolve}`);
              resolve(event.detail);
            } else {
              console.log(`[CAPTCHA-DEBUG] Ignoring result for different taskId: ${event.detail?.externalTriggerId}`);
            }
          };

          timeoutId = setTimeout(() => {
            //@ts-ignore
            window.removeEventListener("CAPTCHA_SOLVER_RESULT", listener);
            console.error(`[CAPTCHA-DEBUG] Timeout waiting for CAPTCHA_SOLVER_RESULT for taskId: ${taskIdToSolve}`);
            reject(new Error(`Timeout waiting for CAPTCHA_SOLVER_RESULT event for taskId ${taskIdToSolve}`));
          }, timeoutMs);

          //@ts-ignore
          window.addEventListener("CAPTCHA_SOLVER_RESULT", listener);
          console.log(`[CAPTCHA-DEBUG] Added listener for CAPTCHA_SOLVER_RESULT, taskId: ${taskIdToSolve}`);

          // Dispatch the trigger event
          const triggerEvent = new CustomEvent("TRIGGER_CAPTCHA_SOLVER", {
            detail: {
              externalTriggerId: taskIdToSolve,
            },
          });
          console.log(`[CAPTCHA-DEBUG] Dispatching TRIGGER_CAPTCHA_SOLVER event for taskId: ${taskIdToSolve}`);
          window.dispatchEvent(triggerEvent);
        });
      },
      taskId,
      360000, // 6 min timeout
    );

    server.log.info(`Received captcha result for task ${taskId}:`, captchaResult);

    return reply.send({
      success: true, // Indicate the API call itself succeeded
      message: "Captcha solving process initiated and result received.",
      taskId: taskId,
      pageId: targetPageId, // Return the ID of the page used
      result: captchaResult, // Include the actual result from the event
    });
  } catch (error) {
    server.log.error(`Error during captcha solve process: ${getErrors(error)}`);
    // Check if the error is a timeout error from evaluate
    if (error instanceof Error && error.message.includes("Timeout waiting for CAPTCHA_SOLVER_RESULT")) {
      return reply.code(408).send({
        // Request Timeout
        message: "Captcha solving timed out.",
        error: error.message,
        success: false,
      });
    }
    // Check for navigation errors which might interrupt evaluate
    if (error instanceof Error && error.message.includes("Navigation interrupted")) {
      return reply.code(503).send({
        // Service Unavailable (page navigated away)
        message: "Page navigation interrupted the captcha solving process.",
        error: error.message,
        success: false,
      });
    }
    return reply.code(500).send({
      message: "Failed to complete captcha solving process.",
      error: getErrors(error),
      success: false,
    });
  }
};
