#!/bin/bash

if [ -d "${PWD}/configFiles" ]; then
    KUBECONFIG_FOLDER=${PWD}/configFiles
else
    echo "Configuration files are not found."
    exit
fi

if [ -d "${PWD}/artifacts" ]; then
    ARTIFACTS=${PWD}/artifacts
else
    echo "Artifacts files are not found."
    exit
fi

#generating artifacts

cd ${ARTIFACTS}

echo "Generating crypto"

cryptogen generate --config crypto-config.yaml && for file in $(find ./ -iname *_sk); do echo $file; dir=$(dirname $file); echo ${dir}; mv ${dir}/*_sk ${dir}/key.pem; done && touch ./status_cryptogen_complete;

echo "Generating genesis.block"

configtxgen -profile SampleMultiNodeEtcdRaft -outputBlock genesis.block && touch ./status_configtxgen_complete && rm ./status_cryptogen_complete;

echo "Generating channel.tx"

configtxgen -profile TwoOrgsChannel -outputCreateChannelTx mychannel.tx -channelID example && touch ./status_channeltx_complete

cd ..

# Create Docker deployment
if [ "$(cat configFiles/peersDeployment.yaml | grep -c tcp://docker:2375)" != "0" ]; then
    echo "peersDeployment.yaml file was configured to use Docker in a container."
    echo "Creating Docker deployment"

    kubectl create -f ${KUBECONFIG_FOLDER}/docker-volume.yaml --namespace=hlf
    kubectl create -f ${KUBECONFIG_FOLDER}/docker.yaml --namespace=hlf
    sleep 5

    dockerPodStatus=$(kubectl get pods -n hlf --selector=name=docker --output=jsonpath={.items..phase})

    while [ "${dockerPodStatus}" != "Running" ]; do
        echo "Wating for Docker container to run. Current status of Docker is ${dockerPodStatus}"
        sleep 5;
        if [ "${dockerPodStatus}" == "Error" ]; then
            echo "There is an error in the Docker pod. Please check logs."
            exit 1
        fi
        dockerPodStatus=$(kubectl get pods -n hlf --selector=name=docker --output=jsonpath={.items..phase})
    done
fi

# Creating Persistant Volume
echo -e "\nCreating volume"
if [ "$(kubectl get pvc -n hlf | grep shared-pvc | awk '{print $2}')" != "Bound" ]; then
    echo "The Persistant Volume does not seem to exist or is not bound"
    echo "Creating Persistant Volume"

    if [ "$1" == "--paid" ]; then
        echo "You passed argument --paid. Make sure you have an IBM Cloud Kubernetes - Standard tier. Else, remove --paid option"
        echo "Running: kubectl create -f ${KUBECONFIG_FOLDER}/createVolume-paid.yaml"
        kubectl create -f ${KUBECONFIG_FOLDER}/createVolume-paid.yaml --namespace=hlf
        sleep 5
    else
        echo "Running: kubectl create -f ${KUBECONFIG_FOLDER}/createVolume.yaml"
        kubectl create -f ${KUBECONFIG_FOLDER}/createVolume.yaml --namespace=hlf
        sleep 5
    fi

    if [ "kubectl get pvc -n hlf | grep shared-pvc | awk '{print $3}'" != "shared-pv" ]; then
        echo "Success creating Persistant Volume"
    else
        echo "Failed to create Persistant Volume"
    fi
else
    echo "The Persistant Volume exists, not creating again"
fi

# kubectl create -f ${KUBECONFIG_FOLDER}/configMap.yaml --namespace=hlf

# Create services for all peers, ca, orderer
echo -e "\nCreating Services for blockchain network"
echo "Running: kubectl create -f ${KUBECONFIG_FOLDER}/blockchain-services.yaml"
kubectl create -f ${KUBECONFIG_FOLDER}/blockchain-services.yaml --namespace=hlf


# Create peers, ca, orderer using Kubernetes Deployments
echo -e "\nCreating new Deployment to create four peers in network"
echo "Running: kubectl create -f ${KUBECONFIG_FOLDER}/peersDeployment.yaml"
kubectl create -f ${KUBECONFIG_FOLDER}/orderers.yaml --namespace=hlf
kubectl create -f ${KUBECONFIG_FOLDER}/peersDeployment.yaml --namespace=hlf

echo "Checking if all deployments are ready"

NUMPENDING=$(kubectl get deployments -n hlf | grep blockchain | awk '{print $5}' | grep 0 | wc -l | awk '{print $1}')
while [ "${NUMPENDING}" != "0" ]; do
    echo "Waiting on pending deployments. Deployments pending = ${NUMPENDING}"
    NUMPENDING=$(kubectl get deployments -n hlf | grep blockchain | awk '{print $5}' | grep 0 | wc -l | awk '{print $1}')
    sleep 1
done

echo "Waiting for 15 seconds for peers and orderer to settle"
sleep 15

cas=$(kubectl get pods -n hlf | grep ca | awk '{print $1}')

for i in $cas
do 
    echo "copying contents to $i"
    kubectl cp ${ARTIFACTS} hlf/$i:/shared/
done

orderers=$(kubectl get pods -n hlf | grep orderer | awk '{print $1}')

for i in $orderers
do 
    echo "copying contents to $i"
    kubectl cp ${ARTIFACTS} hlf/$i:/shared/
done


orgs=$(kubectl get pods -n hlf | grep peer | awk '{print $1}')

for i in $orgs
do 
    echo "copying contents to $i"
    kubectl cp ${ARTIFACTS} hlf/$i:/shared/
done

sleep 10 

./nodeapp.sh

# kubectl create -f ${KUBECONFIG_FOLDER}/nodeapp.yaml -n hlf

sleep 15
echo -e "\nNetwork Setup Completed !!"
