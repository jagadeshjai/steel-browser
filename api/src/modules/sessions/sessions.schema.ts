import { FastifyRequest } from "fastify";
import { z } from "zod";
import { ScrapeRequestBody, ScreenshotRequestBody, PDFRequestBody } from "../actions/actions.schema.js";
import { SessionContextSchema } from "../../services/context/types.js";

export const captchaStatusParam = z
  .object({
    sessionId: z.string().uuid(),
    taskId: z.string().uuid(),
  })
  .describe("Parameters for retrieving captcha solving status");
export type CaptchaStatusParam = z.infer<typeof captchaStatusParam>;

const CreateSession = z.object({
  sessionId: z.string().uuid().optional().describe("Unique identifier for the session"),
  proxyUrl: z.string().optional().describe("Proxy URL to use for the session"),
  userAgent: z.string().optional().describe("User agent string to use for the session"),
  manualSolveCaptcha: z.boolean().optional().default(false).describe("Indicate if manual captcha solving is enabled"),
  sessionContext: SessionContextSchema.optional().describe("Session context data to be used in the created session"),
  isSelenium: z.boolean().optional().describe("Indicates if Selenium is used in the session"),
  blockAds: z.boolean().optional().describe("Flag to indicate if ads should be blocked in the session"),
  // Specific to hosted steel
  logSinkUrl: z.string().optional().describe("Log sink URL to use for the session"),
  extensions: z.array(z.string()).optional().describe("Extensions to use for the session"),
  timezone: z.string().optional().describe("Timezone to use for the session"),
  dimensions: z
    .object({
      width: z.number(),
      height: z.number(),
    })
    .optional()
    .describe("Dimensions to use for the session"),
  extra: z
    .record(z.string(), z.record(z.string(), z.string()))
    .optional()
    .describe("Extra metadata to help initialize the session"),
});

const SessionDetails = z.object({
  id: z.string().uuid().describe("Unique identifier for the session"),
  createdAt: z.string().datetime().describe("Timestamp when the session started"),
  status: z.enum(["idle", "live", "released", "failed"]).describe("Status of the session"),
  duration: z.number().int().describe("Duration of the session in milliseconds"),
  eventCount: z.number().int().describe("Number of events processed in the session"),
  dimensions: z
    .object({
      width: z.number(),
      height: z.number(),
    })
    .optional()
    .describe("Dimensions used for the session"),
  timeout: z.number().int().describe("Session timeout duration in milliseconds"),
  creditsUsed: z.number().int().describe("Amount of credits consumed by the session"),
  websocketUrl: z.string().describe("URL for the session's WebSocket connection"),
  debugUrl: z.string().describe("URL for a viewing the live browser instance for the session"),
  debuggerUrl: z.string().describe("URL for debugging the session"),
  sessionViewerUrl: z.string().describe("URL to view session details"),
  userAgent: z.string().optional().describe("User agent string used in the session"),
  proxy: z.string().optional().describe("Proxy server used for the session"),
  proxyTxBytes: z.number().int().nonnegative().describe("Amount of data transmitted through the proxy"),
  proxyRxBytes: z.number().int().nonnegative().describe("Amount of data received through the proxy"),
  solveCaptcha: z.boolean().optional().describe("Indicates if captcha solving is enabled"),
  manualSolveCaptcha: z.boolean().optional().describe("Indicates if manual captcha solving is enabled"),
  isSelenium: z.boolean().optional().describe("Indicates if Selenium is used in the session"),
});

const ReleaseSession = SessionDetails.merge(
  z.object({ success: z.boolean().describe("Indicates if the session was successfully released") }),
);

const RecordedEvents = z.object({
  events: z.array(z.any()).describe("Events to emit"),
});

const SessionStreamQuery = z.object({
  showControls: z.boolean().optional().default(true).describe("Show controls in the browser iframe"),
  theme: z.enum(["dark", "light"]).optional().default("dark").describe("Theme of the browser iframe"),
  interactive: z.boolean().optional().default(true).describe("Make the browser iframe interactive"),
  pageId: z.string().optional().describe("Page ID to connect to"),
  pageIndex: z.string().optional().describe("Page index (or tab index) to connect to"),
});

const SessionLiveDetailsResponse = z.object({
  sessionViewerUrl: z.string(),
  sessionViewerFullscreenUrl: z.string(),
  websocketUrl: z.string(),
  pages: z.array(
    z.object({
      id: z.string(),
      url: z.string(),
      title: z.string(),
      favicon: z.string().nullable(),
    }),
  ),
  browserState: z.object({
    status: z.enum(["idle", "live", "released", "failed"]),
    userAgent: z.string(),
    browserVersion: z.string(),
    initialDimensions: z.object({
      width: z.number(),
      height: z.number(),
    }),
    pageCount: z.number(),
  }),
});

const SessionStreamResponse = z.string().describe("HTML content for the session streamer view");

const MultipleSessions = z.array(SessionDetails);

const solveCaptchaResponse = z
  .object({
    success: z.boolean().describe("Indicates if the captcha solving was successfully initiated"),
    message: z.string().describe("Details about the captcha solving initiation"),
    pageId: z.string().describe("ID of the page to solve the captcha on"),
    taskId: z.string().optional().describe("ID to track the asynchronous captcha solving task"),
  })
  .describe("Response for initiating an asynchronous captcha solve operation.");

const CaptchaStatusResponse = z
  .object({
    success: z.boolean().describe("Indicates if the captcha solving task was ultimately successful"),
    status: z.enum(["success", "failed", "timeout"]).describe("Final status of the captcha solving task"),
    message: z.string().describe("Details about the final outcome"),
    taskId: z.string().describe("ID of the captcha solving task"),
    pageId: z.string().describe("ID of the page where the captcha was attempted"),
    startedAt: z.string().datetime().describe("Timestamp when the task was initiated"),
    endedAt: z.string().datetime().nullable().describe("Timestamp when the task completed or failed"),
    timeTaken: z.number().nullable().describe("Duration of the task in milliseconds"),
  })
  .describe("Response containing the status of an asynchronous captcha solving task.");

export type SessionsScrapeRequestBody = Omit<ScrapeRequestBody, "url">;
export type SessionsScrapeRequest = FastifyRequest<{ Body: SessionsScrapeRequestBody }>;

export type SessionsScreenshotRequestBody = Omit<ScreenshotRequestBody, "url">;
export type SessionsScreenshotRequest = FastifyRequest<{ Body: SessionsScreenshotRequestBody }>;

export type SessionsPDFRequestBody = Omit<PDFRequestBody, "url">;
export type SessionsPDFRequest = FastifyRequest<{ Body: SessionsPDFRequestBody }>;

export type RecordedEvents = z.infer<typeof RecordedEvents>;
export type CreateSessionBody = z.infer<typeof CreateSession>;
export type CreateSessionRequest = FastifyRequest<{ Body: CreateSessionBody }>;
export type SessionDetails = z.infer<typeof SessionDetails>;
export type MultipleSessions = z.infer<typeof MultipleSessions>;

export type SessionStreamQuery = z.infer<typeof SessionStreamQuery>;
export type SessionStreamRequest = FastifyRequest<{ Querystring: SessionStreamQuery }>;

export const browserSchemas = {
  captchaStatusParam,
  CreateSession,
  SessionDetails,
  MultipleSessions,
  SessionContextSchema,
  RecordedEvents,
  ReleaseSession,
  SessionStreamQuery,
  SessionStreamResponse,
  SessionLiveDetailsResponse,
  solveCaptchaResponse,
  CaptchaStatusResponse,
};

export default browserSchemas;
