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
const fs = require('fs');
const path = require('path');
const helper = require('./helper');
const logger = helper.getLogger('ChannelApi');

const allEventhubs = [];

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

// Attempt to send a request to the orderer with the sendCreateChain method
async function createChannel(
    channelName, channelConfigPath, username, orgName) {

    logger.debug('\n====== Creating Channel \'' + channelName + '\' ======\n');

    const client = helper.getClientForOrg(orgName);
    const channel = helper.getChannelForOrg(orgName);

    // read in the envelope for the channel config raw bytes
    const envelope = fs.readFileSync(path.join(__dirname, channelConfigPath));
    // extract the channel config bytes from the envelope to be signed
    const channelConfig = client.extractChannelConfig(envelope);

    // Acting as a client in the given organization provided with "orgName" param
    const admin = await helper.getOrgAdmin(orgName);

    logger.debug(util.format('Successfully acquired admin user for the organization "%s"',
        orgName));

    // sign the channel config bytes as "endorsement", this is required by
    // the orderer's channel creation policy
    const signature = client.signChannelConfig(channelConfig);
    const request = {
        config: channelConfig,
        signatures: [signature],
        name: channelName,
        orderer: channel.getOrderers()[0],
        txId: client.newTransactionID()
    };

    try {
        const response = await client.createChannel(request);

        if (response && response.status === 'SUCCESS') {
            logger.debug('Successfully created the channel.');
            return {
                success: true,
                message: 'Channel \'' + channelName + '\' created Successfully'
            };
        } else {
            logger.error('\n!!!!!!!!! Failed to create the channel \'' + channelName +
                '\' !!!!!!!!!\n\n');
            throw new Error('Failed to create the channel \'' + channelName + '\'');
        }

    } catch (err) {
        logger.error('\n!!!!!!!!! Failed to create the channel \'' + channelName +
            '\' !!!!!!!!!\n\n');
        throw new Error('Failed to create the channel \'' + channelName + '\'');
    }
}

async function joinChannel(
    channelName, peers, username, org) {

    // on process exit, always disconnect the event hub
    const closeConnections = (isSuccess) => {
        if (isSuccess) {
            logger.debug('\n============ Join Channel is SUCCESS ============\n');
        } else {
            logger.debug('\n!!!!!!!! ERROR: Join Channel FAILED !!!!!!!!\n');
        }
        logger.debug('');

        allEventhubs.forEach((hub) => {
            console.log(hub);
            if (hub && hub.isconnected()) {
                hub.disconnect();
            }
        });
    };

    // logger.debug('\n============ Join Channel ============\n')
    logger.info(util.format(
        'Calling peers in organization "%s" to join the channel', org));

    const client = helper.getClientForOrg(org);
    const channel = helper.getChannelForOrg(org);

    const admin = await helper.getOrgAdmin(org);

    logger.info(util.format('received member object for admin of the organization "%s": ', org));
    const request = {
        txId: client.newTransactionID()
    };

    const genesisBlock = await channel.getGenesisBlock(request);

    const request2 = {
        targets: helper.newPeers(peers, org),
        txId: client.newTransactionID(),
        block: genesisBlock
    };

    const results = await channel.joinChannel(request2);

    logger.debug(util.format('Join Channel R E S P O N S E : %j', results));
    if (results[0] && results[0].response && results[0].response.status === 200) {
        logger.info(util.format(
            'Successfully joined peers in organization %s to the channel \'%s\'',
            org, channelName));
        closeConnections(true);
        const response = {
            success: true,
            message: util.format(
                'Successfully joined peers in organization %s to the channel \'%s\'',
                org, channelName)
        };
        return response;
    } else {
        logger.error(' Failed to join channel');
        closeConnections(false);
        throw new Error('Failed to join channel');
    }
}

async function instantiateChainCode(
    channelName, chaincodeName, chaincodeVersion,
    functionName, args, username, org) {

    logger.debug('\n============ Instantiate chaincode on organization ' + org +
        ' ============\n');

    const channel = helper.getChannelForOrg(org);
    const client = helper.getClientForOrg(org);

    const admin = await helper.getOrgAdmin(org);
    await channel.initialize();

    const txId = client.newTransactionID();
    // send proposal to endorser
    const request = {
        chaincodeId: chaincodeName,
        chaincodeVersion,
        args,
        txId,
        fcn: functionName,
        'endorsement-policy': {
            identities: [
            { role: { name: 'member', mspId: 'Org1MSP' }},
            { role: { name: 'member', mspId: 'Org2MSP' }},
            { role: { name: 'member', mspId: 'Org3MSP' }}
            ],
            policy: {
            '3-of':[{ 'signed-by': 0 }, { 'signed-by': 1 }, { 'signed-by': 2 }]
            }
        }
    };

    try {

        const results = await channel.sendInstantiateProposal(request,600000);

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
            const responses = proposalResponses;
            const proposalResponse = responses[0];
            logger.info(util.format(
                // tslint:disable-next-line:max-line-length
                'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s',
                proposalResponse.response.status, proposalResponse.response.message,
                proposalResponse.response.payload, proposalResponse.endorsement
                    .signature));

            const request2 = {
                proposalResponses: responses,
                proposal
            };
            // set the transaction listener and set a timeout of 30sec
            // if the transaction did not get committed within the timeout period,
            // fail the test
            const deployId = txId.getTransactionID();
            const ORGS = helper.getOrgs();

            const eh = channel.newChannelEventHub('peer1');
            eh.connect();

            const txPromise = new Promise((resolve, reject) => {
                const handle = setTimeout(() => {
                    eh.disconnect();
                    reject();
                }, 600000);

                eh.registerTxEvent(deployId, (tx, code) => {
                    // logger.info(
                    //  'The chaincode instantiate transaction has been committed on peer ' +
                    // eh._ep._endpoint.addr);

                    clearTimeout(handle);
                    eh.unregisterTxEvent(deployId);
                    eh.disconnect();

                    if (code !== 'VALID') {
                        logger.error(
                            'The chaincode instantiate transaction was invalid, code = ' + code);
                        reject();
                    } else {
                        logger.info('The chaincode instantiate transaction was valid.');
                        resolve();
                    }
                });
            });

            const sendPromise = channel.sendTransaction(request2);
            const transactionResults = await Promise.all([sendPromise].concat([txPromise]));

            const response = transactionResults[0];
            if (response.status === 'SUCCESS') {
                logger.info('Successfully sent transaction to the orderer.');
                return 'Chaincode Instantiation is SUCCESS';
            } else {
                logger.error('Failed to order the transaction. Error code: ' + response.status);
                return 'Failed to order the transaction. Error code: ' + response.status;
            }

        } else {
            logger.error(
                // tslint:disable-next-line:max-line-length
                'Failed to send instantiate Proposal or receive valid response. Response null or status is not 200. exiting...'
            );
            // tslint:disable-next-line:max-line-length
            return 'Failed to send instantiate Proposal or receive valid response. Response null or status is not 200. exiting...';
        }

    } catch (err) {
        logger.error('Failed to send instantiate due to error: ' + err.stack ? err
            .stack : err);
        return 'Failed to send instantiate due to error: ' + err.stack ? err.stack :
            err;
    }
}

async function invokeChaincode(
    peerNames, channelName,
    chaincodeName, fcn, args, username, org) {

    logger.debug(
        util.format('\n============ invoke transaction on organization %s ============\n', org));
    
    const client = helper.getClientForOrg(org);
    const channel = helper.getChannelForOrg(org);
    const admin = await helper.getOrgAdmin(org);
    await channel.initialize();
    const targets = (peerNames) ? helper.newPeers(peerNames, org) : undefined;

    const user = await helper.getRegisteredUsers(username, org);
    const ord = Math.floor(Math.random() * 6) + 1;
    const txId = client.newTransactionID();
    logger.debug(util.format('Sending transaction "%j"', txId));
    // send proposal to endorser
    const request = {
        chaincodeId: chaincodeName,
        fcn,
        args,
        txId,
        orderer:channel.getOrderers()[ord-1]
    };

    if (targets) {
        request.targets = targets;
    }

    try {

        const results = await channel.sendTransactionProposal(request);

        const proposalResponses = results[0];
        const proposal = results[1];
        let allGood = true;

        proposalResponses.forEach((pr) => {
            let oneGood = false;
            if (pr.response && pr.response.status === 200) {
                oneGood = true;
                logger.info('transaction proposal was good');
            } else {
                logger.error('transaction proposal was bad');
            }
            allGood = allGood && oneGood;
        });

        if (allGood) {
            const responses = proposalResponses;
            const proposalResponse = responses[0];
            logger.debug(util.format(
                // tslint:disable-next-line:max-line-length
                'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s',
                proposalResponse.response.status, proposalResponse.response.message,
                proposalResponse.response.payload, proposalResponse.endorsement
                    .signature));

            const request2 = {
                proposalResponses: responses,
                proposal
            };

            // set the transaction listener and set a timeout of 30sec
            // if the transaction did not get committed within the timeout period,
            // fail the test
            const transactionID = txId.getTransactionID();
            const eventPromises = [];

            if (!peerNames) {
                peerNames = channel.getPeers().map((peer) => {
                    return peer.getName();
                });
            }

            const eventhubs = helper.newEventHubs(peerNames, org);

            eventhubs.forEach((eh) => {
                eh.connect();

                const txPromise = new Promise((resolve, reject) => {
                    const handle = setTimeout(() => {
                        eh.disconnect();
                        reject();
                    }, 6000000);

                    eh.registerTxEvent(transactionID, (tx, code) => {
                        clearTimeout(handle);
                        eh.unregisterTxEvent(transactionID);
                        eh.disconnect();

                        if (code !== 'VALID') {
                            logger.error(
                                'The example transaction was invalid, code = ' + code);
                            reject();
                        } else {
                            //  logger.info(
                            //    'The example transaction has been committed on peer ' +
                            //   eh._ep._endpoint.addr);
                            resolve();
                        }
                    });
                });
                eventPromises.push(txPromise);
            });

            const sendPromise = channel.sendTransaction(request2);
            const results2 = await Promise.all([sendPromise].concat(eventPromises));

            logger.debug(' event promise all complete and testing complete');

            if (results2[0].status === 'SUCCESS') {
                logger.info('Successfully sent transaction to the orderer.');
                return txId.getTransactionID();
            } else {
                logger.error('Failed to order the transaction. Error code: ' + results2[0].status);
                return 'Failed to order the transaction. Error code: ' + results2[0].status;
            }
        } else {
            logger.error(
                // tslint:disable-next-line:max-line-length
                'Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...'
            );
            // tslint:disable-next-line:max-line-length
            return 'Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...';
        }

    } catch (err) {
        logger.error('Failed to send transaction due to error: ' + err.stack ? err
            .stack : err);
        return 'Failed to send transaction due to error: ' + err.stack ? err.stack :
            err;
    }
}

async function queryChaincode(
    peer, channelName, chaincodeName,
    args, fcn, username, org) {

    const channel = helper.getChannelForOrg(org);
    const client = helper.getClientForOrg(org);
    const target = buildTarget(peer, org);

    const user = await helper.getRegisteredUsers(username, org);

    // send query
    const request = {
        chaincodeId: chaincodeName,
        fcn,
        args
    };

    if (target) {
        request.targets = [target];
    }

    try {
        const responsePayloads = await channel.queryByChaincode(request);

        if (responsePayloads) {
            logger.debug(responsePayloads[0].toString('utf8'));
            return responsePayloads[0].toString('utf8');
            // responsePayloads.forEach((rp) => {
            //     logger.info(args[0] + ' now has ' + rp.toString('utf8') +
            //         ' after the move');
            //     return rp.toString('utf8');
            // });

        } else {
            logger.error('response_payloads is null');
            return 'response_payloads is null';
        }
    } catch (err) {
        logger.error('Failed to send query due to error: ' + err.stack ? err.stack :
            err);
        return 'Failed to send query due to error: ' + err.stack ? err.stack : err;
    }
}

async function getBlockByNumber(
    peer, blockNumber, username, org) {

    const target = buildTarget(peer, org);
    const channel = helper.getChannelForOrg(org);

    const user = await helper.getRegisteredUsers(username, org);

    try {

        const responsePayloads = await channel.queryBlock(parseInt(blockNumber, 10), target);

        if (responsePayloads) {
            logger.debug(responsePayloads.toString());
            return responsePayloads; // response_payloads.data.data[0].buffer;
        } else {
            logger.error('response_payloads is null');
            return 'response_payloads is null';
        }

    } catch (err) {
        logger.error('Failed to query with error:' + err.stack ? err.stack : err);
        return 'Failed to query with error:' + err.stack ? err.stack : err;
    }
}

async function getTransactionByID(
    peer, trxnID, username, org) {

    const target = buildTarget(peer, org);
    const channel = helper.getChannelForOrg(org);

    const user = await helper.getRegisteredUsers(username, org);

    try {

        const responsePayloads = await channel.queryTransaction(trxnID, target);

        if (responsePayloads) {
            logger.debug(responsePayloads);
            return responsePayloads;
        } else {
            logger.error('response_payloads is null');
            return 'response_payloads is null';
        }

    } catch (err) {
        logger.error('Failed to query with error:' + err.stack ? err.stack : err);
        return 'Failed to query with error:' + err.stack ? err.stack : err;
    }
}

async function getChainInfo(peer, username, org) {

    const target = buildTarget(peer, org);
    const channel = helper.getChannelForOrg(org);

    const user = await helper.getRegisteredUsers(username, org);

    try {

        const blockChainInfo = await channel.queryInfo(target);

        if (blockChainInfo) {
            // FIXME: Save this for testing 'getBlockByHash'  ?
            logger.debug('===========================================');
            logger.debug(blockChainInfo.currentBlockHash.toString());
            logger.debug('===========================================');
            // logger.debug(blockchainInfo);
            return blockChainInfo;
        } else {
            logger.error('blockChainInfo is null');
            return 'blockChainInfo is null';
        }

    } catch (err) {
        logger.error('Failed to query with error:' + err.stack ? err.stack : err);
        return 'Failed to query with error:' + err.stack ? err.stack : err;
    }
}

async function getChannels(peer, username, org) {
    const target = buildTarget(peer, org);
    const channel = helper.getChannelForOrg(org);
    const client = helper.getClientForOrg(org);

    const user = await helper.getRegisteredUsers(username, org);

    try {

        const response = await client.queryChannels(target);

        if (response) {
            logger.debug('<<< channels >>>');
            const channelNames = [];
            response.channels.forEach((ci) => {
                channelNames.push('channel id: ' + ci.channel_id);
            });
            return response;
        } else {
            logger.error('response_payloads is null');
            return 'response_payloads is null';
        }

    } catch (err) {
        logger.error('Failed to query with error:' + err.stack ? err.stack : err);
        return 'Failed to query with error:' + err.stack ? err.stack : err;
    }
}

module.exports={
createChannel,
joinChannel,
getChannels,
getChainInfo,
getTransactionByID,
getBlockByNumber,
queryChaincode,
invokeChaincode,
instantiateChainCode
}