
'use strict';

const { FileSystemWallet, Gateway, X509WalletMixin } = require('fabric-network');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml')
const Client = require('fabric-client');

// capture network variables from config.json
const configPath = path.join(process.cwd(), '/config.json');
const configJSON = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configJSON);
var connection_file = config.connection_file;
// var userName = config.userName;
var gatewayDiscovery = config.gatewayDiscovery;

// connect to the connection file
const filePath = path.join(process.cwd(), '/connection.yaml');
let fileContents = fs.readFileSync(filePath, 'utf8');
let connectionFile = yaml.safeLoad(fileContents);

// create car transaction
exports.invoke = async function(chaincodeName, fcn,userName,args) {
    try {

        var response = {};

        // Create a new file system based wallet for managing identities.
        const walletPath = path.join(process.cwd(), '/wallet');
        const wallet = new FileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        // Check to see if we've already enrolled the user.
        const userExists = await wallet.exists(userName);
        if (!userExists) {
            console.log('An identity for the user ' + userName + ' does not exist in the wallet');
            console.log('Run the registerUser.js application before retrying');
            response.error = 'An identity for the user ' + userName + ' does not exist in the wallet. Register ' + userName + ' first';
            return response;
        }

        // Create a new gateway for connecting to our peer node.
        console.log('we here in createRecord')

        const gateway = new Gateway();
        await gateway.connect(connectionFile, { wallet, identity: userName, discovery: gatewayDiscovery });

        // Get the network (channel) our contract is deployed to.
        const network = await gateway.getNetwork(Client.getConfigSetting('channelName'));

        // Get the contract from the network.
        const contract = network.getContract(chaincodeName);

        // Submit the specified transaction.
        // createRecord transaction - requires 3 argument, ex: ('createRecord', 'userid', {igm:val,igg:val:createdAt:val})

        await contract.submitTransaction(fcn, args[0], args[1]);
        console.log('Transaction has been submitted');

        // Disconnect from the gateway.
        await gateway.disconnect();
        response.status = true;
        response.message = 'createRecord Transaction has been submitted';
        return response;        

    } catch (error) {
        console.error(`Failed to submit transaction: ${error}`);
        response.status = false
        response.error = error.message;
        return response; 
    }
}


// query all cars transaction
exports.query = async function(chaincodeName,fcn,userName,recordid) {
    try {
        console.log('starting to queryRecord')

        var response = {};

        // Create a new file system based wallet for managing identities.
        const walletPath = path.join(process.cwd(), '/wallet');
        const wallet = new FileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        // Check to see if we've already enrolled the user.
        const userExists = await wallet.exists(userName);
        if (!userExists) {
            console.log('An identity for the user ' + userName + ' does not exist in the wallet');
            console.log('Run the registerUser.js application before retrying');
            response.error = 'An identity for the user ' + userName + ' does not exist in the wallet. Register ' + userName + ' first';
            return response;            
        }

        // Create a new gateway for connecting to our peer node.
        const gateway = new Gateway();

        await gateway.connect(connectionFile, { wallet, identity: userName, discovery: gatewayDiscovery });

        // Get the network (channel) our contract is deployed to.
        const network = await gateway.getNetwork('example');

        // Get the contract from the network.
        const contract = network.getContract(chaincodeName);

        // Evaluate the specified transaction.
        // queryRecord transaction - requires no arguments, ex: ('queryRecord')
        const result = await contract.evaluateTransaction(fcn,recordid);
        console.log(result,recordid);
        console.log(`Transaction has been evaluated, result is: ${result.toString()}`);

        return result;

    } catch (error) {
        console.error(`Failed to evaluate transaction: ${error}`);
        response.error = error.message;
        return response;
    }
}
