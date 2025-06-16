import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import fastifySwagger from "@fastify/swagger";
import fastifyScalar from "@scalar/fastify-api-reference";
import { titleCase } from "../utils/text.js";
import { buildJsonSchemas } from "../utils/schema.js";
import { getBaseUrl } from "../utils/url.js";
import scalarTheme from "./scalar-theme.js";

// Module schemas
import actionSchemas from "../modules/actions/actions.schema.js";
import cdpSchemas from "../modules/cdp/cdp.schemas.js";
import browserSchemas from "../modules/sessions/sessions.schema.js";
import seleniumSchemas from "../modules/selenium/selenium.schema.js";
import filesSchemas from "../modules/files/files.schema.js";

export interface SteelBrowserSchemaOptions {
  additionalSchemas?: any;
}

// Core schemas that are always included
const CORE_SCHEMAS = {
  ...actionSchemas,
  ...browserSchemas,
  ...cdpSchemas,
  ...seleniumSchemas,
  ...filesSchemas,
};

/**
 * Plugin that registers schemas for Steel Browser and sets up Swagger documentation
 */
const schemaPlugin: FastifyPluginAsync<SteelBrowserSchemaOptions> = async (fastify, opts) => {
  const combinedSchemas = {
    ...CORE_SCHEMAS,
    ...(opts.additionalSchemas || {}),
  };

  const { schemas: allRegisteredSchemas, $ref } = buildJsonSchemas(combinedSchemas);

  if (!fastify.hasDecorator("$ref")) {
    fastify.decorate("$ref", $ref);
  }

  // Register all schemas with Fastify
  for (const schema of allRegisteredSchemas) {
    fastify.addSchema(schema);
  }

  // Setup Swagger documentation
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Steel Browser Instance API",
        description: "Documentation for controlling a single instance of Steel Browser",
        version: "0.0.1",
      },
      servers: [
        {
          url: getBaseUrl(),
          description: "Local server",
        },
      ],
      paths: {}, // paths must be included even if it's an empty object
      components: {
        securitySchemes: {},
      },
    },
    refResolver: {
      buildLocalReference: (json, baseUri, fragment, i) => {
        return titleCase(json.$id as string) || `Fragment${i}`;
      },
    },
  });

  await fastify.register(fastifyScalar as any, {
    // scalar still uses fastify v4
    routePrefix: "/documentation",
    configuration: {
      customCss: scalarTheme,
    },
  });
};

// Export the plugin and reference function
export const { schemas, $ref } = buildJsonSchemas(CORE_SCHEMAS);
export default fp(schemaPlugin, { name: "steel-schema-plugin" });
