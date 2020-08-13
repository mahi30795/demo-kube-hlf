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

const log4js = require('log4js');
const logger = log4js.getLogger('SampleWebApp');
const hfc = require('fabric-client');
const jwt = require('jsonwebtoken');
const helper = require('../lib/helper');
const { getErrorMessage } = require('./utils');

module.exports = function userHandlers(app) {

    async function registerUser(req, res) {
        const username = req.body.username;
        const orgName = req.body.orgName;

        logger.debug('End point : /users');
        logger.debug('User name : ' + username);
        logger.debug('Org name  : ' + orgName);

        if (!username) {
            res.json(getErrorMessage('\'username\''));
            return;
        }
        if (!orgName) {
            res.json(getErrorMessage('\'orgName\''));
            return;
        }
        const token = jwt.sign({
            exp: Math.floor(Date.now() / 1000) + parseInt(
                hfc.getConfigSetting('jwt_expiretime'), 10),
            username,
            orgName
        }, app.get('secret'));

        const response = await helper.getRegisteredUsers(username, orgName);

        if (response && typeof response !== 'string') {
            res.json({
                success: true,
                token
            });
        } else {
            res.json({
                success: false,
                message: response
            });
        }
    }

    const API_ENDPOINT_REGISTER_USER = '/users';

    app.post(API_ENDPOINT_REGISTER_USER, registerUser);
}
