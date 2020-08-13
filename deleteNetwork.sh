
KUBECONFIG_FOLDER=${PWD}/configFiles

# kubectl delete -f ${KUBECONFIG_FOLDER}/chaincode_instantiate.yaml -n hlf
# kubectl delete -f ${KUBECONFIG_FOLDER}/chaincode_install.yaml -n hlf

# kubectl delete -f ${KUBECONFIG_FOLDER}/join_channel.yaml -n hlf
# kubectl delete -f ${KUBECONFIG_FOLDER}/create_channel.yaml -n hlf

kubectl delete --ignore-not-found=true -f ${KUBECONFIG_FOLDER}/docker.yaml -n hlf

kubectl delete -f ${KUBECONFIG_FOLDER}/orderers.yaml --namespace=hlf
kubectl delete -f ${KUBECONFIG_FOLDER}/peersDeployment.yaml -n hlf
kubectl delete -f ${KUBECONFIG_FOLDER}/blockchain-services.yaml -n hlf

# kubectl delete -f ${KUBECONFIG_FOLDER}/generateArtifactsJob.yaml -n hlf
# kubectl delete -f ${KUBECONFIG_FOLDER}/copyArtifactsJob.yaml -n hlf

# kubectl delete -f ${KUBECONFIG_FOLDER}/configMap.yaml --namespace=hlf

kubectl delete -f ${KUBECONFIG_FOLDER}/nodeapp.yaml -n hlf

kubectl delete -f ${KUBECONFIG_FOLDER}/createVolume.yaml -n hlf
kubectl delete --ignore-not-found=true -f ${KUBECONFIG_FOLDER}/docker-volume.yaml -n hlf



sleep 15

echo -e "\npv:" 
kubectl get pv -n hlf
echo -e "\npvc:"
kubectl get pvc -n hlf
echo -e "\njobs:"
kubectl get jobs -n hlf
echo -e "\ndeployments:"
kubectl get deployments -n hlf
echo -e "\nservices:"
kubectl get services -n hlf
echo -e "\npods:"
kubectl get pods -n hlf

echo -e "\nNetwork Deleted!!\n"

