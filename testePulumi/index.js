const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const awsx = require("@pulumi/awsx");
const eks = require("@pulumi/eks");
const k8s = require("@pulumi/kubernetes");
const docker = require("@pulumi/docker");

const vpc = new awsx.ec2.Vpc("vpc-pulumi", {
    numberOfAvailabilityZones: 2,
    tags: { Name: "pulumi-vpc" },
});

const cluster = new eks.Cluster("cluster-pulumi", {
    vpcId: vpc.id,
    subnetIds: vpc.publicSubnetIds,
    tags: { Name: "pulumi-cluster" },
    desiredCapacity: 2,
    minSize: 2,
    maxSize: 2,
    storageClasses: ["gp2"],
    instanceType: "t2.micro",
});

const repo = new aws.ecr.Repository("meu-app-repo");

const creds = aws.ecr.getAuthorizationTokenOutput();

const imageName = pulumi.interpolate`${repo.repositoryUrl}:latest`;

const builtImage = new docker.Image("app-image", {
    imageName: imageName,
    build: {
        context: "../projeto_1/backend",
        dockerfile: "../projeto_1/backend/Dockerfile",
    },
    registry: creds.apply(c => {
        const decoded = Buffer.from(c.authorizationToken, 'base64').toString();
        const [username, password] = decoded.split(':');
        return {
            server: c.proxyEndpoint,
            username,
            password,
        };
    }),
});

const name = "fapp";
const appLabels = { appClass: name };

const deployment = new k8s.apps.v1.Deployment(name, {
    metadata: {
        labels: appLabels,
    },
    spec: {
        selector: { matchLabels: appLabels },
        replicas: 1,
        template: {
            metadata: { labels: appLabels },
            spec: {
                containers: [
                    {
                        name: name,
                        image: builtImage.imageName,
                        ports: [{ containerPort: 8080 }],
                    },
                ],
            },
        },
    },
}, {
    provider: cluster.provider,
});

exports.vpcId = vpc.id;
exports.clusterName = cluster.core.tags;
exports.clusterEndpoint = cluster.core.endpoint;
exports.kubeconfig = cluster.kubeconfig;
exports.ecrImage = builtImage.imageName;
