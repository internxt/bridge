import KeyPair, {
    getFarmerBridgeRequestObject,
    getProofOfWork,
    shutdownEngine,
} from "../utils";
import { testServerURL, testServer, engine } from "../setup";
import { dataGenerator } from "../users.fixtures";

describe("Bridge E2E Tests", () => {
    const privateKey =
        "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3";
    let actualPort: number;

    beforeAll(async () => {
        actualPort = testServerURL.port;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterAll(async () => {
        await shutdownEngine();
    });

    describe("Contacts Management", () => {
        describe("Getting contact by nodeID", () => {
            it("When requesting a contact by nodeID, it should return 404 if contact does not exist", async () => {
                const nonExistentNodeID = dataGenerator.hash({
                    length: 40,
                });

                const response = await testServer.get(
                    `/contacts/${nonExistentNodeID}`
                );

                expect(response.status).toBe(404);
                expect(response.body.error).toBe("Contact not found");
            });
        });

        describe("Challenge Creation", () => {
            it("When requesting a challenge with valid farmer headers, it should return challenge and target", async () => {
                const keypair = new KeyPair(privateKey);

                // Use the actual port the server is running on
                const baseUrl = `http://127.0.0.1:${actualPort}`;
                const requestData = getFarmerBridgeRequestObject(
                    keypair,
                    baseUrl,
                    "POST",
                    "/contacts/challenges",
                    {},
                    {}
                );

                const response = await testServer
                    .post("/contacts/challenges")
                    .set(requestData.headers)
                    .send(requestData.data);

                expect(response.status).toBe(201);
                expect(response.body).toMatchObject({
                    challenge: expect.any(String),
                    target: expect.any(String),
                });

                // Verify challenge is 64 character hex string (32 bytes)
                expect(response.body.challenge).toMatch(/^[a-f0-9]{64}$/i);

                // Verify target is 64 character hex string
                expect(response.body.target).toMatch(/^[a-f0-9]{64}$/i);
            });

            it("When requesting a challenge with invalid signature headers, it should throw", async () => {
                const keypair = new KeyPair(privateKey);

                const wrongBaseUrl = `http://127.1.1.1:${actualPort}`;
                const requestData = getFarmerBridgeRequestObject(
                    keypair,
                    wrongBaseUrl,
                    "POST",
                    "/contacts/challenges",
                    {},
                    {}
                );

                const response = await testServer
                    .post("/contacts/challenges")
                    .set(requestData.headers)
                    .send(requestData.data);

                expect(response.status).toBe(400);
            });
        });

        describe("Node Registration", () => {
            it("When a correct proofOfWork is sent and a node is registered, then the node should be stored", async () => {
                const nodeAddress = "https://network";
                const nodePort = 8000;
                const baseUrl = `http://127.0.0.1:${actualPort}`;
                const keypair = new KeyPair(privateKey);

                const challengeRequestObject = getFarmerBridgeRequestObject(
                    keypair,
                    baseUrl,
                    "POST",
                    "/contacts/challenges",
                    {},
                    {}
                );

                const challengeResponse = await testServer
                    .post("/contacts/challenges")
                    .set(challengeRequestObject.headers)
                    .send(challengeRequestObject.data);

                const { challenge, target } = challengeResponse.body;
                const nonce = await getProofOfWork(challenge, target);

                const nodeCreationRequestObject = getFarmerBridgeRequestObject(
                    keypair,
                    baseUrl,
                    "POST",
                    "/contacts",
                    {
                        "x-challenge": challenge,
                        "x-challenge-nonce": nonce,
                    },
                    {
                        address: nodeAddress,
                        port: nodePort,
                        spaceAvailable: true,
                        protocol: "1.2.0-INXT",
                    }
                );

                const response = await testServer
                    .post("/contacts")
                    .set(nodeCreationRequestObject.headers)
                    .send(nodeCreationRequestObject.data);

                expect(response.status).toBe(200);
                expect(response.body).toMatchObject({
                    nodeID: expect.any(String),
                    address: nodeAddress,
                    port: nodePort,
                });

                const contact = await engine.storage.models.Contact.findOne({
                    _id: response.body.nodeID,
                });

                expect(contact).not.toBeNull();
                expect(contact.address).toBe(nodeAddress);
                expect(contact.port).toBe(nodePort);
            });
        });
    });
});
