/**
 * Copyright 2017 Kapil Sachdeva All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

const log4js = require("log4js");
const util = require("util");
const http = require("http");
const express = require("express");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const expressJWT = require("express-jwt");
const bearerToken = require("express-bearer-token");
const cors = require("cors");
const hfc = require("fabric-client");
const helper = require("./lib/helper");
const api = require("./api");
const randomstring = require("randomstring");
const enrollAdmin = require("./enrollAdmin");
helper.init();

const SERVER_HOST = process.env.HOST || hfc.getConfigSetting("host");
const SERVER_PORT = process.env.PORT || hfc.getConfigSetting("port");

const logger = log4js.getLogger("SampleWebApp");

// create express App
const app = express();

createDefaultUser();

async function createDefaultUser() {
  const user = randomstring.generate(5);
  const org = Math.floor(Math.random() * 3) + 1;
  const response = await helper.getRegisteredUsers(user, `org${org}`);
  if (response && typeof response !== "string") {
    if(enrollAdmin.main(user,`Org${org}MSP`,`ca.org${org}.example.com`)){
      app.set("user", user);
      app.set("org", `org${org}`);
    }
    
  }
}

app.options("*", cors());
app.use(cors());
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: false,
  })
);
app.set("secret", "thisismysecret");
// app.use(
//   expressJWT({
//     secret: "thisismysecret",
//   }).unless({
//     path: ["/users"],
//   })
// );
app.use(bearerToken());

app.use((req, res, next) => {
  if (req.originalUrl.indexOf("/users") >= 0) {
    return next();
  }
  if (req.headers["auth-key"]) {
    const token = req.headers["auth-key"];
    const key = process.env.apikey;
    if (token == key) {
      req.username = app.get("user");
      req.orgname = app.get("org");
      return next();
    } else {
      res.send({
        success: false,
        message:
          "Failed to authenticate token. Make sure to include the " +
          "token returned from /users call in the authorization header " +
          " as a Bearer token",
      });
    }
  } else {
    const token = req.token;
    jwt.verify(token, app.get("secret"), (err, decoded) => {
      if (err) {
        res.send({
          success: false,
          message:
            "Failed to authenticate token. Make sure to include the " +
            "token returned from /users call in the authorization header " +
            " as a Bearer token",
        });
        return;
      } else {
        // add the decoded user name and org name to the request object
        // for the downstream code to use
        req.username = decoded.username;
        req.orgname = decoded.orgName;
        logger.debug(
          util.format(
            "Decoded from JWT token: username - %s, orgname - %s",
            decoded.username,
            decoded.orgName
          )
        );
        return next();
      }
    });
  }
});

// configure various routes
api(app);

const server = http.createServer(app);
server.listen(SERVER_PORT);

logger.info("****************** SERVER STARTED ************************");
logger.info(
  "**************  http://" +
    SERVER_HOST +
    ":" +
    SERVER_PORT +
    "  ******************"
);
server.timeout = 240000;
