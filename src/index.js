import { createServer } from "node:http";
import { join } from "node:path"; // Often needed for path.join, though not explicitly used below, good to keep if static paths get more complex
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
  serverFactory: (handler) => {
    const server = createServer(); // Create server instance

    server.on("request", (req, res) => {
      // --- START: Embedding Restriction Logic ---
      const allowedEmbeddingOrigin = "https://sites.google.com";
      // You could add more origins to this array if needed:
      // const allowedEmbedders = ["https://sites.google.com", "https://another-site.com"];
      // const frameAncestors = allowedEmbedders.join(" ");

      res.setHeader("Content-Security-Policy", `frame-ancestors ${allowedEmbeddingOrigin};`);
      // For X-Frame-Options, if you only have one allowed origin, it's straightforward.
      // If multiple, CSP is primary. DENY is also an option if you rely solely on CSP.
      res.setHeader("X-Frame-Options", `ALLOW-FROM ${allowedEmbeddingOrigin}`);
      // --- END: Embedding Restriction Logic ---

      // Original headers for COOP/COEP (keep these)
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      
      handler(req, res); // Pass to the original Fastify handler
    });

    server.on("upgrade", (req, socket, head) => {
      if (req.url.endsWith("/wisp/")) {
        wisp.routeRequest(req, socket, head);
      } else {
        socket.end();
      }
    });
    return server; // Return the configured server
  },
});

// Static file serving configuration
fastify.register(fastifyStatic, {
  root: publicPath, // This serves index.html and other files from ultraviolet-static's public dir
  decorateReply: true, // Allows using reply.sendFile from this registration
});

// This specific route for uv.config.js seems to want to serve it from publicPath/uv/uv.config.js
// Ensure 'uv/uv.config.js' exists within the 'publicPath' directory structure if this is intended.
// If uv.config.js is at the root of publicPath, then it should be just 'uv.config.js'.
// If uv.config.js is inside the uvPath (from @titaniumnetwork-dev/ultraviolet), then the path is different.
// Let's assume it's meant to be from the uvPath for now, as that makes more sense for a UV config.
// If it IS in publicPath, adjust accordingly.
/* Original:
fastify.get("/uv/uv.config.js", (req, res) => {
  return res.sendFile("uv/uv.config.js", publicPath); // Check this path carefully
});
*/
// It's more likely uv.config.js is part of the @titaniumnetwork-dev/ultraviolet package (uvPath)
// and served by the /uv/ static registration below. If you need a custom one at /uv/uv.config.js
// that's different from the one in uvPath, this route would be needed.
// For now, I'll comment it out, assuming the general static serving for /uv/ handles it.
// If you have a specific custom uv.config.js you're trying to serve, uncomment and verify path.

fastify.register(fastifyStatic, {
  root: uvPath,
  prefix: "/uv/",
  decorateReply: false, // Set to false if you don't need reply.sendFile specifically for this path
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

// Server listening and shutdown logic
fastify.server.on("listening", () => {
  const address = fastify.server.address();
  if (address) { // Check if address is not null
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
if (isNaN(port) || port === 0) { // Also check for port 0
    port = 8080;
}

fastify.listen({
  port: port,
  host: "0.0.0.0", // Listen on all available network interfaces
}, (err, address) => { // Callback for listen
    if (err) {
        console.error("Error starting server:", err);
        process.exit(1);
    }
    // The 'listening' event handler above will also log, but this confirms listen() succeeded.
    console.log(`Server listening on ${address}`);
});
