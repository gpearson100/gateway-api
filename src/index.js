#!/usr/bin/env node

// absolute imports
import https from "https";
import fs from "fs";

// relative imports
import app from "./app";
import { logger } from "./services/logger";

import { exec } from "child_process";

const globalConfig =
  require("./services/configuration_manager").configManagerInstance.readAllConfigs();

const env = globalConfig.CORE.NODE_ENV;
const port = globalConfig.CORE.PORT;
const certPassphrase = globalConfig.CERT_PASSPHRASE;
const ethereumChain = globalConfig.ETHEREUM_CHAIN;
const terraChain = globalConfig.TERRA_CHAIN;
let certPath = globalConfig.CERT_PATH;

if ((typeof certPath === "undefined" && certPath == null) || certPath === "") {
  console.log(
    "Using local cert path for testing. Check your config if this is not intended."
  );

  // assuming it is local development using test script to generate certs
  certPath = "./certs";
} else {
  certPath = certPath.replace(/\/$/, "");
}
console.log("Setting up app enviornment...");
// set app environment
app.set("env", env);
const options = {
  key: fs.readFileSync(certPath.concat("/server_key.pem"), {
    encoding: "utf-8",
  }),
  cert: fs.readFileSync(certPath.concat("/server_cert.pem"), {
    encoding: "utf-8",
  }),
  // request client certificate from user
  requestCert: true,
  // reject requests with no valid certificate
  rejectUnauthorized: true,
  // use ca cert created with own key for self-signed
  ca: [fs.readFileSync(certPath.concat("/ca_cert.pem"), { encoding: "utf-8" })],
  passphrase: certPassphrase,
};

console.log("Creating server...");
try {
  const server = https.createServer(options, app);

  isRunning(port, (status) => {
    process.env.DB_PID = status;
    console.log(`Gateway-api server using pid: ` + status);
    logger.debug(`Gateway-api server using pid: ` + status);
  });

  // event listener for "error" event
  const onError = (error) => {
    if (error.syscall !== "listen") {
      throw error;
    }

    const bind = typeof port === "string" ? "Pipe " + port : "Port " + port;

    // handle specific listen errors with friendly messages
    switch (error.code) {
      case "EACCES":
        console.error(bind + " requires elevated privileges");
        process.exit(1);
        break;
      case "EADDRINUSE":
        console.error(bind + " is already in use");
        process.exit(1);
        break;
      default:
        throw error;
    }
  };

  // event listener for "listening" event.
  const onListening = () => {
    const addr = server.address();
    const bind =
      typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
    console.log("listening on " + bind);
    logger.debug("listening on " + bind);
  };

  // listen on provided port, on all network interfaces.
  server.listen(port);
  server.on("error", onError);
  server.on("listening", onListening);

  const serverConfig = {
    app: "gateway-api",
    port: port,
    pid: process.env.DB_PID,
    ethereumChain: ethereumChain,
    terraChain: terraChain,
  };

  logger.info(JSON.stringify(serverConfig));
  console.log(serverConfig);
} catch (error) {
  console.error(error);
}

// eslint-disable-next-line no-unused-vars
function isRunning(query, cb) {
  let platform = process.platform;
  let cmd = "";
  let isPid = isNumeric(query);
  if (isPid) {
    switch (platform) {
      case "win32":
        cmd = `netstat -aon | findstr "0.0.0.0:${query}"`;
        break;
      case "darwin":
        cmd = `ps -ax | grep ${query}`;
        break;
      case "linux":
        cmd = `netstat -tlnp 2>/dev/null | awk '/:${query} */ {split($NF,a,"/"); print a[1]}'`;
        break;
      default:
        break;
    }
  }
  exec(cmd, (err, stdout, stderr) => {
    if (isPid) {
      if (isNumeric(stdout)) {
        cb(stdout);
      } else {
        cb(lastword(stdout));
      }
    } else {
      cb(stdout.toLowerCase().indexOf(query.toLowerCase()) > -1);
    }
  });
  return;
}

function isNumeric(str) {
  return !isNaN(str) && !isNaN(parseFloat(str));
}

function lastword(words) {
  var n = words.split(" ");
  return n[n.length - 1];
}
