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

const util = require('util');
const helper = require('./helper');
const logger = helper.getLogger('ChaincodeApi');

function buildTarget(peer, org) {
    let target = null;
    if (typeof peer !== 'undefined') {
        const targets = helper.newPeers([peer], org);
        if (targets && targets.length > 0) {
            target = targets[0];
        }
    }

    return target;
}

async function installChaincode(
    peers, chaincodeName, chaincodePath,
    chaincodeVersion, username, org) {

    logger.debug(
        '\n============ Install chaincode on organizations ============\n');

    helper.setupChaincodeDeploy();

    const channel = helper.getChannelForOrg(org);
    const client = helper.getClientForOrg(org);

    const admin = await helper.getOrgAdmin(org);

    const request = {
        targets: helper.newPeers(peers, org),
        chaincodePath,
        chaincodeId: chaincodeName,
        chaincodeVersion,
        txId: client.newTransactionID(true)
    };

    try {

        const results = await client.installChaincode(request);

        const proposalResponses = results[0];
        const proposal = results[1];
        let allGood = true;

        proposalResponses.forEach((pr) => {
            let oneGood = false;
            if (pr.response && pr.response.status === 200) {
                oneGood = true;
                logger.info('install proposal was good');
            } else {
                logger.error('install proposal was bad');
            }
            allGood = allGood && oneGood;
        });

        if (allGood) {
            const proposalResponse = proposalResponses[0];
            logger.info(util.format(
                'Successfully sent install Proposal and received ProposalResponse: Status - %s',
                proposalResponse.response.status));
            logger.debug('\nSuccessfully Installed chaincode on organization ' + org +
                '\n');
            return 'Successfully Installed chaincode on organization ' + org;
        } else {
            logger.error(
                // tslint:disable-next-line:max-line-length
                'Failed to send install Proposal or receive valid response. Response null or status is not 200. exiting...'
            );
            // tslint:disable-next-line:max-line-length
            return 'Failed to send install Proposal or receive valid response. Response null or status is not 200. exiting...';
        }

    } catch (err) {
        logger.error('Failed to send install proposal due to error: ' + err.stack ?
            err.stack : err);
        throw new Error('Failed to send install proposal due to error: ' + err.stack ?
            err.stack : err);
    }
}

async function getInstalledChaincodes(
    peer, type, username, org) {

    const target = buildTarget(peer, org);
    const channel = helper.getChannelForOrg(org);
    const client = helper.getClientForOrg(org);

    const user = await helper.getOrgAdmin(org);

    try {

        let response = null;

        if (type === 'installed') {
            response = await client.queryInstalledChaincodes(target);
        } else {
            response = await channel.queryInstantiatedChaincodes(target);
        }

        if (response) {
            if (type === 'installed') {
                logger.debug('<<< Installed Chaincodes >>>');
            } else {
                logger.debug('<<< Instantiated Chaincodes >>>');
            }

            const details = [];
            response.chaincodes.forEach((c) => {
                logger.debug('name: ' + c.name + ', version: ' +
                    c.version + ', path: ' + c.path
                );
                details.push('name: ' + c.name + ', version: ' +
                    c.version + ', path: ' + c.path
                );
            });

            return details;
        } else {
            logger.error('response is null');
            return 'response is null';
        }

    } catch (err) {
        logger.error('Failed to query with error:' + err.stack ? err.stack : err);
        return 'Failed to query with error:' + err.stack ? err.stack : err;
    }
}

module.exports={
getInstalledChaincodes,
installChaincode
}