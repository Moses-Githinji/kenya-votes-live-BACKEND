# Kenya Votes Live Backend - Test Suite

This directory contains comprehensive tests for the Kenya Votes Live Backend system, covering all aspects of the updated RBAC (Role-Based Access Control) system and functionality.

## 🏗️ Test Structure

```
tests/
├── jest.config.js          # Jest configuration
├── setup.js                # Global test setup and utilities
├── run-tests.js            # Test runner script
├── README.md               # This file
├── middleware/
│   └── auth.test.js        # Authentication and authorization tests
├── routes/
│   ├── public.test.js      # Public API route tests
│   ├── commissioner.test.js # IEBC Commissioner route tests
│   ├── returningOfficer.test.js # Returning Officer route tests
│   ├── presidingOfficer.test.js # Presiding Officer route tests
│   ├── electionClerk.test.js # Election Clerk route tests
│   └── systemAdmin.test.js # System Administrator route tests
├── websocket/
│   └── websocket.test.js   # WebSocket functionality tests
└── integration/
    └── integration.test.js # End-to-end integration tests
```

## 🧪 Test Categories

### 1. Authentication & Authorization Tests (`tests/middleware/auth.test.js`)

- JWT token validation
- Role-based access control
- Permission enforcement
- Token expiration handling
- Malformed token handling

### 2. Public API Tests (`tests/routes/public.test.js`)

- Vote counting endpoints
- Candidate information
- Region-based data access
- Public data filtering
- Error handling for public routes

### 3. Role-Specific Route Tests

Each role has dedicated test files covering their specific functionality:

#### IEBC Commissioner (`tests/routes/commissioner.test.js`)

- Election management
- Certification processes
- System oversight
- Audit log access
- Performance monitoring

#### Returning Officer (`tests/routes/returningOfficer.test.js`)

- Constituency-level vote management
- Polling station oversight
- Certification workflows
- Regional reporting

#### Presiding Officer (`tests/routes/presidingOfficer.test.js`)

- Polling station operations
- Real-time vote updates
- Voter turnout tracking
- Incident reporting

#### Election Clerk (`tests/routes/electionClerk.test.js`)

- Data entry validation
- Quality assurance
- Administrative support
- Task management

#### System Administrator (`tests/routes/systemAdmin.test.js`)

- User management
- System configuration
- Performance monitoring
- Backup and recovery
- Alert management

### 4. WebSocket Tests (`tests/websocket/websocket.test.js`)

- Real-time notifications
- Role-based channels
- Connection management
- Message broadcasting
- Error handling

### 5. Integration Tests (`tests/integration/integration.test.js`)

- Complete election workflow
- Data flow between components
- End-to-end functionality
- System performance
- Security compliance

## 🚀 Running Tests

### Prerequisites

1. Ensure the test database is set up and accessible
2. Install dependencies: `npm install`
3. Set up test environment variables (see `.env.test`)

### Available Test Commands

```bash
# Run all tests with custom runner
npm run test:all

# Run specific test categories
npm run test:unit          # Unit tests (middleware + routes)
npm run test:integration   # Integration tests
npm run test:websocket     # WebSocket tests

# Run individual role tests
npm run test:auth          # Authentication tests
npm run test:public        # Public API tests
npm run test:commissioner  # Commissioner tests
npm run test:returning-officer    # Returning Officer tests
npm run test:presiding-officer    # Presiding Officer tests
npm run test:election-clerk       # Election Clerk tests
npm run test:system-admin         # System Admin tests

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run specific test file
npx jest tests/routes/commissioner.test.js
```

### Test Runner Script

The `run-tests.js` script provides a comprehensive test execution with:

- Category-by-category execution
- Detailed progress reporting
- Summary statistics
- Color-coded output
- Error handling

```bash
node tests/run-tests.js
```

## 📊 Test Coverage

The test suite covers:

### Functional Coverage

- ✅ All API endpoints
- ✅ Authentication and authorization
- ✅ Role-based access control
- ✅ Data validation
- ✅ Error handling
- ✅ Real-time functionality

### Security Coverage

- ✅ JWT token validation
- ✅ Role enforcement
- ✅ Data isolation
- ✅ Input validation
- ✅ SQL injection prevention

### Performance Coverage

- ✅ Concurrent request handling
- ✅ Database query optimization
- ✅ Memory usage monitoring
- ✅ Response time validation

### Integration Coverage

- ✅ End-to-end workflows
- ✅ Data flow validation
- ✅ System component interaction
- ✅ Error recovery scenarios

## 🔧 Test Configuration

### Jest Configuration (`jest.config.js`)

- ES modules support
- Test environment setup
- Coverage reporting
- Timeout settings
- File matching patterns

### Global Setup (`setup.js`)

- Database connection
- Test utilities
- Data cleanup
- JWT token generation
- Mock data creation

### Test Utilities

Global test utilities available in all tests:

```javascript
// Generate test JWT tokens
global.testUtils.generateTestToken(role, userId);

// Create test users
global.testUtils.createTestUser(role, email);

// Create test regions
global.testUtils.createTestRegions();

// Create test candidates
global.testUtils.createTestCandidates(regionId);

// Clean up test data
global.testUtils.cleanupTestData();
```

## 📝 Writing New Tests

### Test Structure

```javascript
describe("Feature Name", () => {
  beforeEach(async () => {
    // Setup test data
  });

  it("should perform expected behavior", async () => {
    // Test implementation
    expect(result).toBe(expected);
  });
});
```

### Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up test data
3. **Descriptive names**: Use clear test descriptions
4. **Assertions**: Test both success and failure cases
5. **Mocking**: Mock external dependencies appropriately

### Adding New Role Tests

1. Create test file: `tests/routes/newRole.test.js`
2. Import required modules and routes
3. Set up test data and tokens
4. Test all endpoints for the role
5. Verify role-specific permissions
6. Test error cases and edge cases

## 🐛 Debugging Tests

### Common Issues

1. **Database connection**: Ensure test database is running
2. **JWT tokens**: Check token generation and validation
3. **Async operations**: Use proper async/await patterns
4. **Data cleanup**: Ensure proper cleanup between tests

### Debug Commands

```bash
# Run single test with verbose output
npx jest tests/routes/commissioner.test.js --verbose

# Run with debug logging
DEBUG=* npx jest tests/routes/commissioner.test.js

# Run specific test case
npx jest tests/routes/commissioner.test.js -t "should certify election results"
```

## 📈 Performance Testing

The test suite includes performance validation:

- Response time assertions
- Concurrent request handling
- Memory usage monitoring
- Database query optimization

## 🔒 Security Testing

Security tests cover:

- Authentication bypass attempts
- Role escalation attempts
- Data access violations
- Input validation
- SQL injection prevention

## 📋 Test Reports

After running tests, you can find:

- Coverage reports in `coverage/` directory
- Test results in console output
- Detailed logs for debugging

## 🤝 Contributing

When adding new features:

1. Write tests first (TDD approach)
2. Ensure all tests pass
3. Maintain test coverage above 80%
4. Update this documentation
5. Follow existing test patterns

## 📞 Support

For test-related issues:

1. Check the test logs
2. Verify environment setup
3. Review test configuration
4. Consult this documentation
5. Check for similar issues in existing tests
