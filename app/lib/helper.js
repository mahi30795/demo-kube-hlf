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
const path = require('path');
const fs = require('fs');
const util = require('util');
const config = require('../config');
const Client = require('fabric-client');
const copService = require('fabric-ca-client');

const logger = log4js.getLogger('Helper');
logger.setLevel('DEBUG');
Client.setLogger(logger);

let ORGS;
const clients = {};
const channels = {};
const caClients = {};

function readAllFiles(dir) {
    const files = fs.readdirSync(dir);
    const certs = [];
    files.forEach((fileName) => {
        const filePath = path.join(dir, fileName);
        const data = fs.readFileSync(filePath);
        certs.push(data);
    });
    return certs;
}

function getKeyStoreForOrg(org) {
    return Client.getConfigSetting('keyValueStore') + '_' + org;
}

async function setupPeers(channel, org, client) {
    for (const key in ORGS[org].peers) {
        if (key) {
            const data = fs.readFileSync(
                path.join(__dirname, ORGS[org].peers[key]['tls_cacerts']));
            const peer = client.newPeer(
                ORGS[org].peers[key].requests,
                {
                    'pem': Buffer.from(data).toString(),
                    'ssl-target-name-override': ORGS[org].peers[key]['server-hostname']
                }
            );
            peer.setName(key);

            channel.addPeer(peer);
        }
    }
}

function newOrderer(client, index) {
    const caRootsPath = ORGS.orderer[index].tls_cacerts;
    const data = fs.readFileSync(path.join(__dirname, caRootsPath));
    const caroots = Buffer.from(data).toString();
    return client.newOrderer(ORGS.orderer[index].url, {
        'pem': caroots,
        'ssl-target-name-override': ORGS.orderer[index]['server-hostname']
    });
}

function getOrgName(org) {
    logger.debug("org",org);
    return ORGS[org].name;
}

function getMspID(org) {
    logger.debug('Msp ID : ' + ORGS[org].mspid);
    return ORGS[org].mspid;
}

function newRemotes(names, forPeers, userOrg) {
    const client = getClientForOrg(userOrg);
    const channel = getChannelForOrg(userOrg);
    const targets = [];
    // find the peer that match the names
    names.forEach((n) => {
        if (ORGS[userOrg].peers[n]) {
            // found a peer matching the name
            const data = fs.readFileSync(
                path.join(__dirname, ORGS[userOrg].peers[n]['tls_cacerts']));
            const grpcOpts = {
                'pem': Buffer.from(data).toString(),
                'ssl-target-name-override': ORGS[userOrg].peers[n]['server-hostname']
            };

            const peer = client.newPeer(ORGS[userOrg].peers[n].requests, grpcOpts);
            if (forPeers) {
                targets.push(peer);
            } else {
                const eh = channel.newChannelEventHub(peer);
                targets.push(eh);
            }
        }
    });

    if (targets.length === 0) {
        logger.error(util.format('Failed to find peers matching the names %s', names));
    }

    return targets;
}

async function getAdminUser(userOrg) {
    const users = Client.getConfigSetting('admins');
    const username = users[0].username;
    const password = users[0].secret;

    const client = getClientForOrg(userOrg);

    const store = await Client.newDefaultKeyValueStore({
        path: getKeyStoreForOrg(getOrgName(userOrg))
    });

    client.setStateStore(store);

    const user = await client.getUserContext(username, true);

    if (user && user.isEnrolled()) {
        logger.info('Successfully loaded member from persistence');
        return user;
    }

    const caClient = caClients[userOrg];

    const enrollment = await caClient.enroll({
        enrollmentID: username,
        enrollmentSecret: password
    });

    logger.info('Successfully enrolled user \'' + username + '\'');
    const userOptions = {
        username,
        mspid: getMspID(userOrg),
        cryptoContent: {
            privateKeyPEM: enrollment.key.toBytes(),
            signedCertPEM: enrollment.certificate
        },
        skipPersistence: false
    };

    const member = await client.createUser(userOptions);
    return member;
}

function newPeers(names, org) {
    return newRemotes(names, true, org);
}

function newEventHubs(names, org) {
    return newRemotes(names, false, org);
}

function setupChaincodeDeploy() {
    process.env.GOPATH = path.join(__dirname, Client.getConfigSetting('CC_SRC_PATH'));
}

function getOrgs() {
    return ORGS;
}

function getClientForOrg(org) {
    return clients[org];
}

function getChannelForOrg(org) {
    return channels[org];
}

async function init() {

    Client.addConfigFile(path.join(__dirname, config.networkConfigFile));
    Client.addConfigFile(path.join(__dirname, '../app_config.json'));
    ORGS = Client.getConfigSetting('network-config');

    // set up the client and channel objects for each org
    for (const key in ORGS) {
        if (key.indexOf('org') === 0) {
            const client = new Client();

            const cryptoSuite = Client.newCryptoSuite();
            // TODO: Fix it up as setCryptoKeyStore is only available for s/w impl
            (cryptoSuite).setCryptoKeyStore(
                Client.newCryptoKeyStore({
                    path: getKeyStoreForOrg(ORGS[key].name)
                }));

            client.setCryptoSuite(cryptoSuite);

            const channel = client.newChannel(Client.getConfigSetting('channelName'));
            if(ORGS.orderer.length>0){
                for (let index = 0; index < ORGS.orderer.length; index++) {
                    channel.addOrderer(newOrderer(client,index));
                }
            }

            
            clients[key] = client;
            channels[key] = channel;
            setupPeers(channel, key, client);
            
            
            const caUrl = ORGS[key].ca;
            caClients[key] = new copService(
                caUrl, null /*defautl TLS opts*/, '' /* default CA */, cryptoSuite);
        }
    }
}

async function getRegisteredUsers(
    username, userOrg) {

    const client = getClientForOrg(userOrg);

    const store = await Client.newDefaultKeyValueStore({
        path: getKeyStoreForOrg(getOrgName(userOrg))
    });

    client.setStateStore(store);
    const user = await client.getUserContext(username, true);

    if (user && user.isEnrolled()) {
        logger.info('Successfully loaded member from persistence');
        return user;
    }

    logger.info('Using admin to enroll this user ..');

    // get the Admin and use it to enroll the user
    const adminUser = await getAdminUser(userOrg);

    const caClient = caClients[userOrg];
    let affiliationService = caClient.newAffiliationService();

      let registeredAffiliations = await affiliationService.getAll(
        adminUser
      );
      if (
        !registeredAffiliations.result.affiliations.some(
          (x) => x.name == userOrg.toLowerCase()
        )
      ) {
        let affiliation = "org3.department1";
        await affiliationService.create(
          {
            name: affiliation,
            force: true,
          },
          adminUser
        );
      }
    const secret = await caClient.register({
        enrollmentID: username,
        affiliation: userOrg + '.department1'
    }, adminUser);

    logger.debug(username + ' registered successfully');

    const message = await caClient.enroll({
        enrollmentID: username,
        enrollmentSecret: secret
    });

    if (message && typeof message === 'string' && message.includes(
        'Error:')) {
        logger.error(username + ' enrollment failed');
    }
    logger.debug(username + ' enrolled successfully');

    const userOptions = {
        username,
        mspid: getMspID(userOrg),
        cryptoContent: {
            privateKeyPEM: message.key.toBytes(),
            signedCertPEM: message.certificate
        },
        skipPersistence: false
    };

    const member = await client.createUser(userOptions);
    return member;
}

function getLogger(moduleName) {
    const moduleLogger = log4js.getLogger(moduleName);
    moduleLogger.setLevel('DEBUG');
    return moduleLogger;
}

async function getOrgAdmin(userOrg) {
    const admin = ORGS[userOrg].admin;
    const keyPath = path.join(__dirname, admin.key);
    const keyPEM = Buffer.from(readAllFiles(keyPath)[0]).toString();
    const certPath = path.join(__dirname, admin.cert);
    const certPEM = readAllFiles(certPath)[0].toString();

    const client = getClientForOrg(userOrg);
    const cryptoSuite = Client.newCryptoSuite();

    if (userOrg) {
        (cryptoSuite).setCryptoKeyStore(
            Client.newCryptoKeyStore({ path: getKeyStoreForOrg(getOrgName(userOrg)) }));
        client.setCryptoSuite(cryptoSuite);
    }

    const store = await Client.newDefaultKeyValueStore({
        path: getKeyStoreForOrg(getOrgName(userOrg))
    });

    client.setStateStore(store);

    return client.createUser({
        username: 'peer' + userOrg + 'Admin',
        mspid: getMspID(userOrg),
        cryptoContent: {
            privateKeyPEM: keyPEM,
            signedCertPEM: certPEM
        },
        skipPersistence: false
    });
}

module.exports ={
init,
getOrgAdmin,
getLogger,
getRegisteredUsers,
getOrgs,
newPeers,
newEventHubs,
setupChaincodeDeploy,
getClientForOrg,
getChannelForOrg,
getKeyStoreForOrg
}