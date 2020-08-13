#!/bin/bash
#
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
#

jq --version > /dev/null 2>&1
if [ $? -ne 0 ]; then
	echo "Please Install 'jq' https://stedolan.github.io/jq/ to execute this script"
	echo
	exit 1
fi
starttime=$(date +%s)
URL=ad75989531a2b41619831e2c9f014625-2005947795.us-west-2.elb.amazonaws.com
echo "POST request Enroll on Org1  ..."
echo
ORG1_TOKEN=$(curl -s -X POST \
  http://$URL:30080/users \
  -H "content-type: application/x-www-form-urlencoded" \
  -d 'username=Jim&orgName=org1')
echo $ORG1_TOKEN
ORG1_TOKEN=$(echo $ORG1_TOKEN | jq ".token" | sed "s/\"//g")
echo
echo "ORG1 token is $ORG1_TOKEN"
echo
echo "POST request Enroll on Org2 ..."
echo
ORG2_TOKEN=$(curl -s -X POST \
  http://$URL:30080/users \
  -H "content-type: application/x-www-form-urlencoded" \
  -d 'username=Barry&orgName=org2')
echo $ORG2_TOKEN
ORG2_TOKEN=$(echo $ORG2_TOKEN | jq ".token" | sed "s/\"//g")
echo
echo "ORG2 token is $ORG2_TOKEN"
echo
echo
echo "POST request Enroll on Org3 ..."
echo
ORG3_TOKEN=$(curl -s -X POST \
  http://$URL:30080/users \
  -H "content-type: application/x-www-form-urlencoded" \
  -d 'username=Barry&orgName=org3')
echo $ORG3_TOKEN
ORG3_TOKEN=$(echo $ORG3_TOKEN | jq ".token" | sed "s/\"//g")
echo
echo "ORG3 token is $ORG3_TOKEN"
echo
echo
echo "POST request Create channel  ..."
echo
curl -s -X POST \
  http://$URL:30080/channels \
  -H "authorization: Bearer $ORG1_TOKEN" \
  -H "content-type: application/json" \
  -d '{
	"channelName":"example",
	"channelConfigPath":"../../shared/artifacts/mychannel.tx"
}'
echo
echo
sleep 5
echo "POST request Join channel on Org1"
echo
curl -s -X POST \
  http://$URL:30080/channels/example/peers \
  -H "authorization: Bearer $ORG1_TOKEN" \
  -H "content-type: application/json" \
  -d '{
	"peers": ["peer1","peer2"]
}'
echo
echo

echo "POST request Join channel on Org2"
echo
curl -s -X POST \
  http://$URL:30080/channels/example/peers \
  -H "authorization: Bearer $ORG2_TOKEN" \
  -H "content-type: application/json" \
  -d '{
	"peers": ["peer1","peer2"]
}'
echo
echo

echo "POST request Join channel on Org3"
echo
curl -s -X POST \
  http://$URL:30080/channels/example/peers \
  -H "authorization: Bearer $ORG3_TOKEN" \
  -H "content-type: application/json" \
  -d '{
	"peers": ["peer1","peer2"]
}'
echo
echo

echo "POST Install chaincode on Org1"
echo
curl -s -X POST \
  http://$URL:30080/chaincodes \
  -H "authorization: Bearer $ORG1_TOKEN" \
  -H "content-type: application/json" \
  -d '{
	"peers": ["peer1","peer2"],
	"chaincodeName":"mycc",
	"chaincodePath":"exampleCC/",
	"chaincodeVersion":"v0"
}'
echo
echo


echo "POST Install chaincode on Org2"
echo
curl -s -X POST \
  http://$URL:30080/chaincodes \
  -H "authorization: Bearer $ORG2_TOKEN" \
  -H "content-type: application/json" \
  -d '{
	"peers": ["peer1","peer2"],
	"chaincodeName":"mycc",
	"chaincodePath":"exampleCC/",
	"chaincodeVersion":"v0"
}'
echo
echo

echo "POST Install chaincode on Org3"
echo
curl -s -X POST \
  http://$URL:30080/chaincodes \
  -H "authorization: Bearer $ORG3_TOKEN" \
  -H "content-type: application/json" \
  -d '{
	"peers": ["peer1","peer2"],
	"chaincodeName":"mycc",
	"chaincodePath":"exampleCC/",
	"chaincodeVersion":"v0"
}'
echo
echo

echo "POST instantiate chaincode on peer1 of Org1"
echo
curl -s -X POST \
  http://$URL:30080/channels/example/chaincodes \
  -H "authorization: Bearer $ORG1_TOKEN" \
  -H "content-type: application/json" \
  -d '{
	"chaincodeName":"mycc",
	"chaincodeVersion":"v0",
  "fcn":"init",
	"args":[]
}'
echo
echo

# echo "POST invoke chaincode on peers of Org1 and Org2"
# echo
# TRX_ID=$(curl -s -X POST \
#   http://$URL:30080/channels/example/chaincodes/mycc \
#   -H "authorization: Bearer $ORG1_TOKEN" \
#   -H "content-type: application/json" \
#   -d '{
# 	"fcn":"createRecord",
# 	"args":["CAR12", {"igm":"0.5","igg":"0.14","createdAt":"2020-04-26T17:30:31.770Z"}]
# }')
# echo "Transaction ID is $TRX_ID"
# echo
# echo

# echo "GET query chaincode on peer1 of Org1"
# echo
# curl -s -X GET \
#   "http://$URL:30080/channels/example/chaincodes/mycc?peer=peer1&fcn=queryCar&args=%5B%22CAR12%22%5D" \
#   -H "authorization: Bearer $ORG1_TOKEN" \
#   -H "content-type: application/json"
# echo
# echo

# echo "GET query Block by blockNumber"
# echo
# curl -s -X GET \
#   "http://$URL:30080/channels/example/blocks/1?peer=peer1" \
#   -H "authorization: Bearer $ORG1_TOKEN" \
#   -H "content-type: application/json"
# echo
# echo

# echo "GET query Transaction by TransactionID"
# echo
# curl -s -X GET http://$URL:30080/channels/example/transactions/$TRX_ID?peer=peer1 \
#   -H "authorization: Bearer $ORG1_TOKEN" \
#   -H "content-type: application/json"
# echo
# echo

# echo "GET query ChainInfo"
# echo
# curl -s -X GET \
#   "http://$URL:30080/channels/example?peer=peer1" \
#   -H "authorization: Bearer $ORG1_TOKEN" \
#   -H "content-type: application/json"
# echo
# echo

# echo "GET query Installed chaincodes"
# echo
# curl -s -X GET \
#   "http://$URL:30080/chaincodes?peer=peer1&type=installed" \
#   -H "authorization: Bearer $ORG1_TOKEN" \
#   -H "content-type: application/json"
# echo
# echo

# echo "GET query Instantiated chaincodes"
# echo
# curl -s -X GET \
#   "http://$URL:30080/chaincodes?peer=peer1&type=instantiated" \
#   -H "authorization: Bearer $ORG1_TOKEN" \
#   -H "content-type: application/json"
# echo
# echo

# echo "GET query Channels"
# echo
# curl -s -X GET \
#   "http://$URL:30080/channels?peer=peer1" \
#   -H "authorization: Bearer $ORG1_TOKEN" \
#   -H "content-type: application/json"
# echo
# echo

echo "Total execution time : $(($(date +%s)-starttime)) secs ..."
