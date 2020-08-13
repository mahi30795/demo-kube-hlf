#!/bin/bash

if [ -d "${PWD}/configFiles" ]; then
    KUBECONFIG_FOLDER=${PWD}/configFiles
else
    echo "Configuration files are not found."
    exit
fi

# Create Docker deployment
if [ "$(cat configFiles/peersDeployment.yaml | grep -c tcp://docker:2375)" != "0" ]; then
    echo "peersDeployment.yaml file was configured to use Docker in a container."
    echo "Creating Docker deployment"

    kubectl create -f ${KUBECONFIG_FOLDER}/docker-volume.yaml --namespace=hlf-test
    kubectl create -f ${KUBECONFIG_FOLDER}/docker.yaml --namespace=hlf-test
    sleep 5

    dockerPodStatus=$(kubectl get pods -n hlf-test --selector=name=docker --output=jsonpath={.items..phase})

    while [ "${dockerPodStatus}" != "Running" ]; do
        echo "Wating for Docker container to run. Current status of Docker is ${dockerPodStatus}"
        sleep 5;
        if [ "${dockerPodStatus}" == "Error" ]; then
            echo "There is an error in the Docker pod. Please check logs."
            exit 1
        fi
        dockerPodStatus=$(kubectl get pods -n hlf-test --selector=name=docker --output=jsonpath={.items..phase})
    done
fi

# Creating Persistant Volume
echo -e "\nCreating volume"
if [ "$(kubectl get pvc -n hlf-test | grep shared-pvc | awk '{print $2}')" != "Bound" ]; then
    echo "The Persistant Volume does not seem to exist or is not bound"
    echo "Creating Persistant Volume"

    if [ "$1" == "--paid" ]; then
        echo "You passed argument --paid. Make sure you have an IBM Cloud Kubernetes - Standard tier. Else, remove --paid option"
        echo "Running: kubectl create -f ${KUBECONFIG_FOLDER}/createVolume-paid.yaml"
        kubectl create -f ${KUBECONFIG_FOLDER}/createVolume-paid.yaml --namespace=hlf-test
        sleep 5
    else
        echo "Running: kubectl create -f ${KUBECONFIG_FOLDER}/createVolume.yaml"
        kubectl create -f ${KUBECONFIG_FOLDER}/createVolume.yaml --namespace=hlf-test
        sleep 5
    fi

    if [ "kubectl get pvc -n hlf-test | grep shared-pvc | awk '{print $3}'" != "shared-pv" ]; then
        echo "Success creating Persistant Volume"
    else
        echo "Failed to create Persistant Volume"
    fi
else
    echo "The Persistant Volume exists, not creating again"
fi

# Copy the required files(configtx.yaml, cruypto-config.yaml, sample chaincode etc.) into volume
echo -e "\nCreating Copy artifacts job."
echo "Running: kubectl create -f ${KUBECONFIG_FOLDER}/copyArtifactsJob.yaml"
kubectl create -f ${KUBECONFIG_FOLDER}/copyArtifactsJob.yaml --namespace=hlf-test

pod=$(kubectl get pods -n hlf-test --selector=job-name=copyartifacts --output=jsonpath={.items..metadata.name})

podSTATUS=$(kubectl get pods -n hlf-test --selector=job-name=copyartifacts --output=jsonpath={.items..phase})

while [ "${podSTATUS}" != "Running" ]; do
    echo "Wating for container of copy artifact pod to run. Current status of ${pod} is ${podSTATUS}"
    sleep 5;
    if [ "${podSTATUS}" == "Error" ]; then
        echo "There is an error in copyartifacts job. Please check logs."
        exit 1
    fi
    podSTATUS=$(kubectl get pods -n hlf-test --selector=job-name=copyartifacts --output=jsonpath={.items..phase})
done

echo -e "${pod} is now ${podSTATUS}"
echo -e "\nStarting to copy artifacts in persistent volume."

#fix for this script to work on icp and ICS
kubectl cp ./artifacts $pod:/shared/

echo "Waiting for 10 more seconds for copying artifacts to avoid any network delay"
sleep 10
JOBSTATUS=$(kubectl get jobs -n hlf-test |grep "copyartifacts" |awk '{print $2}')
while [ "${JOBSTATUS}" != "1/1" ]; do
    echo "Waiting for copyartifacts job to complete"
    sleep 1;
    PODSTATUS=$(kubectl get pods -n hlf-test | grep "copyartifacts" | awk '{print $3}')
        if [ "${PODSTATUS}" == "Error" ]; then
            echo "There is an error in copyartifacts job. Please check logs."
            exit 1
        fi
    JOBSTATUS=$(kubectl get jobs -n hlf-test |grep "copyartifacts" |awk '{print $2}')
done
echo "Copy artifacts job completed"


# Generate Network artifacts using configtx.yaml and crypto-config.yaml
echo -e "\nGenerating the required artifacts for Blockchain network"
echo "Running: kubectl create -f ${KUBECONFIG_FOLDER}/generateArtifactsJob.yaml"
kubectl create -f ${KUBECONFIG_FOLDER}/generateArtifactsJob.yaml --namespace=hlf-test

JOBSTATUS=$(kubectl get jobs -n hlf-test|grep utils|awk '{print $2}')
while [ "${JOBSTATUS}" != "1/1" ]; do
    echo "Waiting for generateArtifacts job to complete"
    sleep 1;
    # UTILSLEFT=$(kubectl get pods | grep utils | awk '{print $2}')
    UTILSSTATUS=$(kubectl get pods -n hlf-test | grep "utils" | awk '{print $3}')
    if [ "${UTILSSTATUS}" == "Error" ]; then
            echo "There is an error in utils job. Please check logs."
            exit 1
    fi
    # UTILSLEFT=$(kubectl get pods | grep utils | awk '{print $2}')
    JOBSTATUS=$(kubectl get jobs -n hlf-test |grep utils|awk '{print $2}')
done

kubectl create -f ${KUBECONFIG_FOLDER}/configMap.yaml --namespace=hlf-test

# Create services for all peers, ca, orderer
echo -e "\nCreating Services for blockchain network"
echo "Running: kubectl create -f ${KUBECONFIG_FOLDER}/blockchain-services.yaml"
kubectl create -f ${KUBECONFIG_FOLDER}/blockchain-services.yaml --namespace=hlf-test


# Create peers, ca, orderer using Kubernetes Deployments
echo -e "\nCreating new Deployment to create four peers in network"
echo "Running: kubectl create -f ${KUBECONFIG_FOLDER}/peersDeployment.yaml"
kubectl create -f ${KUBECONFIG_FOLDER}/orderers.yaml --namespace=hlf-test
kubectl create -f ${KUBECONFIG_FOLDER}/peersDeployment.yaml --namespace=hlf-test

echo "Checking if all deployments are ready"

NUMPENDING=$(kubectl get deployments -n hlf-test | grep blockchain | awk '{print $5}' | grep 0 | wc -l | awk '{print $1}')
while [ "${NUMPENDING}" != "0" ]; do
    echo "Waiting on pending deployments. Deployments pending = ${NUMPENDING}"
    NUMPENDING=$(kubectl get deployments -n hlf-test | grep blockchain | awk '{print $5}' | grep 0 | wc -l | awk '{print $1}')
    sleep 1
done

echo "Waiting for 15 seconds for peers and orderer to settle"
# sleep 15


# Generate channel artifacts using configtx.yaml and then create channel
echo -e "\nCreating channel transaction artifact and a channel"
echo "Running: kubectl create -f ${KUBECONFIG_FOLDER}/create_channel.yaml"
kubectl create -f ${KUBECONFIG_FOLDER}/create_channel.yaml --namespace=hlf-test

JOBSTATUS=$(kubectl get jobs -n hlf-test |grep createchannel |awk '{print $2}')
while [ "${JOBSTATUS}" != "1/1" ]; do
    echo "Waiting for createchannel job to be completed"
    sleep 1;
    if [ "$(kubectl get pods -n hlf-test | grep createchannel | awk '{print $3}')" == "Error" ]; then
        echo "Create Channel Failed"
        exit 1
    fi
    JOBSTATUS=$(kubectl get jobs -n hlf-test |grep createchannel |awk '{print $2}')
done
echo "Create Channel Completed Successfully"

kubectl create -f ${KUBECONFIG_FOLDER}/nodeapp.yaml -n hlf-test
# # Join all peers on a channel
# echo -e "\nCreating joinchannel job"
# echo "Running: kubectl create -f ${KUBECONFIG_FOLDER}/join_channel.yaml"
# kubectl create -f ${KUBECONFIG_FOLDER}/join_channel.yaml --namespace=hlf-test

# JOBSTATUS=$(kubectl get jobs -n hlf-test |grep joinchannel |awk '{print $2}')
# while [ "${JOBSTATUS}" != "1/1" ]; do
#     echo "Waiting for joinchannel job to be completed"
#     sleep 1;
#     if [ "$(kubectl get pods -n hlf-test | grep joinchannel | awk '{print $3}')" == "Error" ]; then
#         echo "Join Channel Failed"
#         exit 1
#     fi
#     # JOBSTATUS=$(kubectl get jobs |grep joinchannel |awk '{print $2}')
#     JOB=$(kubectl get pods -n hlf-test | grep joinchannel | awk '{print $3}')
#     for j in $JOB
#     do
#         if [ $j == "Completed" ]; then
#         JOBSTATUS="1/1"
#         fi
#     done
    
    
# done
# echo "Join Channel Completed Successfully"


# # Install chaincode on each peer
# echo -e "\nCreating installchaincode job"
# echo "Running: kubectl create -f ${KUBECONFIG_FOLDER}/chaincode_install.yaml"
# kubectl create -f ${KUBECONFIG_FOLDER}/chaincode_install.yaml -n hlf-test

# JOBSTATUS=$(kubectl get jobs -n hlf-test|grep chaincodeinstall |awk '{print $2}')
# while [ "${JOBSTATUS}" != "1/1" ]; do
#     echo "Waiting for chaincodeinstall job to be completed"
#     sleep 1;
#     if [ "$(kubectl get pods -n hlf-test | grep chaincodeinstall | awk '{print $3}')" == "Error" ]; then
#         echo "Chaincode Install Failed"
#         exit 1
#     fi
#     JOBSTATUS=$(kubectl get jobs -n hlf-test |grep chaincodeinstall |awk '{print $2}')
# done
# echo "Chaincode Install Completed Successfully"


# # Instantiate chaincode on channel
# echo -e "\nCreating chaincodeinstantiate job"
# echo "Running: kubectl create -f ${KUBECONFIG_FOLDER}/chaincode_instantiate.yaml"
# kubectl create -f ${KUBECONFIG_FOLDER}/chaincode_instantiate.yaml -n hlf-test

# JOBSTATUS=$(kubectl get jobs -n hlf-test |grep chaincodeinstantiate |awk '{print $2}')
# while [ "${JOBSTATUS}" != "1/1" ]; do
#     echo "Waiting for chaincodeinstantiate job to be completed"
#     sleep 1;
#     if [ "$(kubectl get pods -n hlf-test | grep chaincodeinstantiate | awk '{print $3}')" == "Error" ]; then
#         echo "Chaincode Instantiation Failed"
#         exit 1
#     fi
#     JOBSTATUS=$(kubectl get jobs -n hlf-test |grep chaincodeinstantiate |awk '{print $2}')
# done
# echo "Chaincode Instantiation Completed Successfully"

sleep 15
echo -e "\nNetwork Setup Completed !!"
