import { io as Client } from "socket.io-client";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

describe("WebSocket Functionality", () => {
  let httpServer;
  let io;
  let clientSocket;
  let commissionerSocket;
  let returningOfficerSocket;
  let presidingOfficerSocket;
  let electionClerkSocket;
  let sysAdminSocket;

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer);

    // Mock the WebSocket routes
    io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication error"));
      }

      try {
        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || "test-secret"
        );
        socket.user = decoded;
        next();
      } catch (err) {
        next(new Error("Authentication error"));
      }
    });

    io.on("connection", (socket) => {
      const userRole = socket.user.role;

      // Join role-specific channels
      socket.join(`role:${userRole}`);

      // Join public channels
      socket.join("public:votes");
      socket.join("public:results");

      // Role-specific channels
      if (userRole === "IEBC_COMMISSIONER") {
        socket.join("commissioner:overview");
        socket.join("commissioner:certifications");
        socket.join("commissioner:audit");
      } else if (userRole === "RETURNING_OFFICER") {
        socket.join("returning-officer:constituency");
        socket.join("returning-officer:certifications");
      } else if (userRole === "PRESIDING_OFFICER") {
        socket.join("presiding-officer:station");
        socket.join("presiding-officer:turnout");
      } else if (userRole === "ELECTION_CLERK") {
        socket.join("election-clerk:data-entry");
        socket.join("election-clerk:validation");
      } else if (userRole === "SYSTEM_ADMINISTRATOR") {
        socket.join("system-admin:health");
        socket.join("system-admin:alerts");
        socket.join("system-admin:users");
      }

      socket.emit("connected", { role: userRole, userId: socket.user.sub });
    });

    httpServer.listen(3001, done);
  });

  afterAll((done) => {
    if (clientSocket) clientSocket.close();
    if (commissionerSocket) commissionerSocket.close();
    if (returningOfficerSocket) returningOfficerSocket.close();
    if (presidingOfficerSocket) presidingOfficerSocket.close();
    if (electionClerkSocket) electionClerkSocket.close();
    if (sysAdminSocket) sysAdminSocket.close();

    io.close(() => {
      httpServer.close(done);
    });
  });

  beforeEach(() => {
    // Create tokens for different roles
    const publicToken = global.testUtils.generateTestToken("PUBLIC");
    const commissionerToken =
      global.testUtils.generateTestToken("IEBC_COMMISSIONER");
    const returningOfficerToken =
      global.testUtils.generateTestToken("RETURNING_OFFICER");
    const presidingOfficerToken =
      global.testUtils.generateTestToken("PRESIDING_OFFICER");
    const electionClerkToken =
      global.testUtils.generateTestToken("ELECTION_CLERK");
    const sysAdminToken = global.testUtils.generateTestToken(
      "SYSTEM_ADMINISTRATOR"
    );

    // Create client connections
    clientSocket = Client("http://localhost:3001", {
      auth: { token: publicToken },
    });

    commissionerSocket = Client("http://localhost:3001", {
      auth: { token: commissionerToken },
    });

    returningOfficerSocket = Client("http://localhost:3001", {
      auth: { token: returningOfficerToken },
    });

    presidingOfficerSocket = Client("http://localhost:3001", {
      auth: { token: presidingOfficerToken },
    });

    electionClerkSocket = Client("http://localhost:3001", {
      auth: { token: electionClerkToken },
    });

    sysAdminSocket = Client("http://localhost:3001", {
      auth: { token: sysAdminToken },
    });
  });

  describe("Connection and Authentication", () => {
    it("should connect successfully with valid token", (done) => {
      clientSocket.on("connected", (data) => {
        expect(data).toHaveProperty("role");
        expect(data).toHaveProperty("userId");
        expect(data.role).toBe("PUBLIC");
        done();
      });
    });

    it("should reject connection without token", (done) => {
      const unauthorizedSocket = Client("http://localhost:3001");

      unauthorizedSocket.on("connect_error", (error) => {
        expect(error.message).toBe("Authentication error");
        unauthorizedSocket.close();
        done();
      });
    });

    it("should reject connection with invalid token", (done) => {
      const invalidSocket = Client("http://localhost:3001", {
        auth: { token: "invalid-token" },
      });

      invalidSocket.on("connect_error", (error) => {
        expect(error.message).toBe("Authentication error");
        invalidSocket.close();
        done();
      });
    });
  });

  describe("Role-based Channel Access", () => {
    it("should allow IEBC Commissioner to access commissioner channels", (done) => {
      commissionerSocket.on("connected", (data) => {
        expect(data.role).toBe("IEBC_COMMISSIONER");

        // Test commissioner-specific channels
        io.to("commissioner:overview").emit("commissioner:overview-update", {
          message: "Commissioner overview updated",
        });

        commissionerSocket.on("commissioner:overview-update", (data) => {
          expect(data.message).toBe("Commissioner overview updated");
          done();
        });
      });
    });

    it("should allow Returning Officer to access returning officer channels", (done) => {
      returningOfficerSocket.on("connected", (data) => {
        expect(data.role).toBe("RETURNING_OFFICER");

        // Test returning officer-specific channels
        io.to("returning-officer:constituency").emit(
          "returning-officer:constituency-update",
          {
            message: "Constituency data updated",
          }
        );

        returningOfficerSocket.on(
          "returning-officer:constituency-update",
          (data) => {
            expect(data.message).toBe("Constituency data updated");
            done();
          }
        );
      });
    });

    it("should allow Presiding Officer to access presiding officer channels", (done) => {
      presidingOfficerSocket.on("connected", (data) => {
        expect(data.role).toBe("PRESIDING_OFFICER");

        // Test presiding officer-specific channels
        io.to("presiding-officer:station").emit(
          "presiding-officer:station-update",
          {
            message: "Polling station updated",
          }
        );

        presidingOfficerSocket.on(
          "presiding-officer:station-update",
          (data) => {
            expect(data.message).toBe("Polling station updated");
            done();
          }
        );
      });
    });

    it("should allow Election Clerk to access election clerk channels", (done) => {
      electionClerkSocket.on("connected", (data) => {
        expect(data.role).toBe("ELECTION_CLERK");

        // Test election clerk-specific channels
        io.to("election-clerk:data-entry").emit(
          "election-clerk:data-entry-update",
          {
            message: "Data entry completed",
          }
        );

        electionClerkSocket.on("election-clerk:data-entry-update", (data) => {
          expect(data.message).toBe("Data entry completed");
          done();
        });
      });
    });

    it("should allow System Administrator to access system admin channels", (done) => {
      sysAdminSocket.on("connected", (data) => {
        expect(data.role).toBe("SYSTEM_ADMINISTRATOR");

        // Test system admin-specific channels
        io.to("system-admin:health").emit("system-admin:health-update", {
          message: "System health status updated",
        });

        sysAdminSocket.on("system-admin:health-update", (data) => {
          expect(data.message).toBe("System health status updated");
          done();
        });
      });
    });
  });

  describe("Public Channel Access", () => {
    it("should allow all users to access public channels", (done) => {
      let connectedCount = 0;
      const expectedConnections = 6; // All socket types

      const checkAllConnected = () => {
        connectedCount++;
        if (connectedCount === expectedConnections) {
          // Send message to public channel
          io.to("public:votes").emit("public:vote-update", {
            message: "New vote count available",
          });

          // All sockets should receive the message
          let receivedCount = 0;
          const expectedReceivers = 6;

          const checkAllReceived = () => {
            receivedCount++;
            if (receivedCount === expectedReceivers) {
              done();
            }
          };

          clientSocket.on("public:vote-update", checkAllReceived);
          commissionerSocket.on("public:vote-update", checkAllReceived);
          returningOfficerSocket.on("public:vote-update", checkAllReceived);
          presidingOfficerSocket.on("public:vote-update", checkAllReceived);
          electionClerkSocket.on("public:vote-update", checkAllReceived);
          sysAdminSocket.on("public:vote-update", checkAllReceived);
        }
      };

      clientSocket.on("connected", checkAllConnected);
      commissionerSocket.on("connected", checkAllConnected);
      returningOfficerSocket.on("connected", checkAllConnected);
      presidingOfficerSocket.on("connected", checkAllConnected);
      electionClerkSocket.on("connected", checkAllConnected);
      sysAdminSocket.on("connected", checkAllConnected);
    });
  });

  describe("Channel Isolation", () => {
    it("should not allow public users to access role-specific channels", (done) => {
      clientSocket.on("connected", () => {
        // Send message to commissioner channel
        io.to("commissioner:overview").emit("commissioner:overview-update", {
          message: "Commissioner data",
        });

        // Public user should not receive this message
        clientSocket.on("commissioner:overview-update", () => {
          done(
            new Error("Public user should not receive commissioner messages")
          );
        });

        // Wait a bit to ensure no message is received
        setTimeout(() => {
          done();
        }, 100);
      });
    });

    it("should not allow different roles to access each other's channels", (done) => {
      commissionerSocket.on("connected", () => {
        returningOfficerSocket.on("connected", () => {
          // Send message to returning officer channel
          io.to("returning-officer:constituency").emit(
            "returning-officer:constituency-update",
            {
              message: "Constituency data",
            }
          );

          // Commissioner should not receive this message
          commissionerSocket.on("returning-officer:constituency-update", () => {
            done(
              new Error(
                "Commissioner should not receive returning officer messages"
              )
            );
          });

          // Wait a bit to ensure no message is received
          setTimeout(() => {
            done();
          }, 100);
        });
      });
    });
  });

  describe("Real-time Vote Updates", () => {
    it("should broadcast vote updates to all connected users", (done) => {
      let connectedCount = 0;
      const expectedConnections = 6;

      const checkAllConnected = () => {
        connectedCount++;
        if (connectedCount === expectedConnections) {
          // Simulate vote update
          const voteUpdate = {
            candidateId: "test-candidate-id",
            regionCode: "TEST001",
            count: 150,
            timestamp: new Date().toISOString(),
          };

          io.to("public:votes").emit("vote:updated", voteUpdate);

          let receivedCount = 0;
          const expectedReceivers = 6;

          const checkAllReceived = () => {
            receivedCount++;
            if (receivedCount === expectedReceivers) {
              done();
            }
          };

          clientSocket.on("vote:updated", (data) => {
            expect(data).toHaveProperty("candidateId");
            expect(data).toHaveProperty("regionCode");
            expect(data).toHaveProperty("count");
            expect(data.candidateId).toBe("test-candidate-id");
            expect(data.count).toBe(150);
            checkAllReceived();
          });

          commissionerSocket.on("vote:updated", checkAllReceived);
          returningOfficerSocket.on("vote:updated", checkAllReceived);
          presidingOfficerSocket.on("vote:updated", checkAllReceived);
          electionClerkSocket.on("vote:updated", checkAllReceived);
          sysAdminSocket.on("vote:updated", checkAllReceived);
        }
      };

      clientSocket.on("connected", checkAllConnected);
      commissionerSocket.on("connected", checkAllConnected);
      returningOfficerSocket.on("connected", checkAllConnected);
      presidingOfficerSocket.on("connected", checkAllConnected);
      electionClerkSocket.on("connected", checkAllConnected);
      sysAdminSocket.on("connected", checkAllConnected);
    });
  });

  describe("Role-specific Notifications", () => {
    it("should send certification notifications to commissioners", (done) => {
      commissionerSocket.on("connected", () => {
        const certificationNotification = {
          regionCode: "TEST001",
          status: "PENDING",
          message: "New certification request",
        };

        io.to("commissioner:certifications").emit(
          "certification:requested",
          certificationNotification
        );

        commissionerSocket.on("certification:requested", (data) => {
          expect(data).toHaveProperty("regionCode");
          expect(data).toHaveProperty("status");
          expect(data).toHaveProperty("message");
          expect(data.regionCode).toBe("TEST001");
          expect(data.status).toBe("PENDING");
          done();
        });
      });
    });

    it("should send system alerts to system administrators", (done) => {
      sysAdminSocket.on("connected", () => {
        const systemAlert = {
          severity: "HIGH",
          message: "Database connection issue detected",
          timestamp: new Date().toISOString(),
        };

        io.to("system-admin:alerts").emit("system:alert", systemAlert);

        sysAdminSocket.on("system:alert", (data) => {
          expect(data).toHaveProperty("severity");
          expect(data).toHaveProperty("message");
          expect(data).toHaveProperty("timestamp");
          expect(data.severity).toBe("HIGH");
          done();
        });
      });
    });
  });

  describe("Connection Management", () => {
    it("should handle disconnection gracefully", (done) => {
      clientSocket.on("connected", () => {
        clientSocket.disconnect();

        // Should not receive messages after disconnection
        clientSocket.on("public:vote-update", () => {
          done(new Error("Should not receive messages after disconnection"));
        });

        // Send a message after disconnection
        setTimeout(() => {
          io.to("public:votes").emit("public:vote-update", {
            message: "Test message",
          });

          // Wait to ensure no message is received
          setTimeout(() => {
            done();
          }, 100);
        }, 50);
      });
    });

    it("should handle reconnection with same token", (done) => {
      clientSocket.on("connected", (data) => {
        expect(data.role).toBe("PUBLIC");

        clientSocket.disconnect();

        // Reconnect with same token
        setTimeout(() => {
          const reconnectedSocket = Client("http://localhost:3001", {
            auth: { token: global.testUtils.generateTestToken("PUBLIC") },
          });

          reconnectedSocket.on("connected", (reconnectData) => {
            expect(reconnectData.role).toBe("PUBLIC");
            reconnectedSocket.close();
            done();
          });
        }, 50);
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed messages gracefully", (done) => {
      clientSocket.on("connected", () => {
        // Send malformed message
        clientSocket.emit("malformed:message", "invalid-data");

        // Should not crash the connection
        setTimeout(() => {
          expect(clientSocket.connected).toBe(true);
          done();
        }, 100);
      });
    });

    it("should handle rapid reconnections", (done) => {
      let reconnectCount = 0;
      const maxReconnects = 5;

      const testReconnect = () => {
        const testSocket = Client("http://localhost:3001", {
          auth: { token: global.testUtils.generateTestToken("PUBLIC") },
        });

        testSocket.on("connected", () => {
          testSocket.disconnect();
          reconnectCount++;

          if (reconnectCount < maxReconnects) {
            setTimeout(testReconnect, 10);
          } else {
            done();
          }
        });
      };

      testReconnect();
    });
  });
});
