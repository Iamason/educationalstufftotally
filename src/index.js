import { createServer } from "node:http";
import { join } from "node:path";
import { hostname } from "node:os";
import wisp from "wisp-server-node";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

// static paths
import { publicPath } from "ultraviolet-static";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

// Initialize Fastify ONCE
const fastify = Fastify({
  // We still need serverFactory for Wisp's WebSocket upgrade handling
  serverFactory: (handler) => {
    const server = createServer(handler); // Pass Fastify's handler to createServer

    server.on("upgrade", (req, socket, head) => {
      if (req.url.endsWith("/wisp/")) {
        wisp.routeRequest(req, socket, head);
      } else {
        socket.end();
      }
    });
    return server;
  },
});

// --- START: Global Hook for Embedding Restriction and COOP/COEP Headers ---
fastify.addHook('onRequest', async (request, reply) => {
  const allowedEmbeddingOrigin = "https://sites.google.com";
  // If you had multiple:
  // const allowedEmbedders = ["https://sites.google.com", "https://another-trusted.site"];
  // const frameAncestors = allowedEmbedders.join(" ");
  // reply.header("Content-Security-Policy", `frame-ancestors ${frameAncestors};`);

  reply.header("Content-Security-Policy", `frame-ancestors ${allowedEmbeddingOrigin};`);
  reply.header("X-Frame-Options", `ALLOW-FROM ${allowedEmbeddingOrigin}`); // Fallback

  // Original headers for COOP/COEP (keep these)
  reply.header("Cross-Origin-Opener-Policy", "same-origin");
  reply.header("Cross-Origin-Embedder-Policy", "require-corp");
});
// --- END: Global Hook ---


// Static file serving configuration
fastify.register(fastifyStatic, {
  root: publicPath,
  decorateReply: true,
});

// Commented out as before, assuming /uv/ static serving handles it.
/*
fastify.get("/uv/uv.config.js", (req, res) => {
  return res.sendFile("uv/uv.config.js", publicPath);
});
*/

fastify.register(fastifyStatic, {
  root: uvPath,
  prefix: "/uv/",
  decorateReply: false,
});

fastify.register(fastifyStatic, {
  root: epoxyPath,
  prefix: "/epoxy/",
  decorateReply: false,
});

fastify.register(fastifyStatic, {
  root: baremuxPath,
  prefix: "/baremux/",
  decorateReply: false,
});

// Server listening and shutdown logic (remains the same)
fastify.server.on("listening", () => {
  const address = fastify.server.address();
  if (address) {
    console.log("Listening on:");
    console.log(`\thttp://localhost:${address.port}`);
    console.log(`\thttp://${hostname()}:${address.port}`);
    console.log(
        `\thttp://${
            address.family === "IPv6" ? `[${address.address}]` : address.address
        }:${address.port}`
    );
  } else {
    console.log("Server is starting or address is not yet available.");
  }
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  console.log("Signal received: closing HTTP server");
  fastify.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
}

let port = parseInt(process.env.PORT || "");
if (isNaN(port) || port === 0) {
    port = 8080;
}

fastify.listen({
  port: port,
  host: "0.0.0.0",
}, (err, address) => {
    if (err) {
        console.error("Error starting server:", err);
        process.exit(1);
    }
    console.log(`Server listening on ${address}`);
});
