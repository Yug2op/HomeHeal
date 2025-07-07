# Software Requirement Specification (SRS) Document
Project Title: GoRepair - Fix Fast, Easy Tracking

## 1. Introduction
### 1.1 Purpose 
GoRepair is a full-service digital platform for booking and managing home appliance repairs. It enables real-time communication and service flow among Users, Technicians, Admins, Managers, Partners, Dealers, and Brand Ambassadors via dedicated role-based dashboards. This SRS is intended to guide the frontend, backend, and UI/UX teams in designing and implementing the application with clarity and precision.

### 1.2 Scope 
The platform streamlines service booking, technician assignment, payment handling, complaint escalation, and subscription management with features like real-time tracking, digital wallets, and role-based access.

## 2. Overall Description
### 2.1 Stakeholders & Dashboards:
- Admin
- User
- Partner
- Technician
- Manager (General, Support, Finance)
- Brand Ambassador
- Dealer

## 3. System Architecture
### 3.1 Technical Stack
- **Frontend**: React.js with Redux for state management
- **Backend**: Node.js with Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT with OAuth 2.0
- **Real-time**: Socket.IO for live updates
- **Mobile**: React Native for cross-platform mobile apps
- **Hosting**: AWS/GCP with containerization (Docker, Kubernetes)
- **CI/CD**: GitHub Actions/Jenkins

### 3.2 System Components
1. **API Gateway**: Single entry point for all client requests
2. **Authentication Service**: Handles user authentication and authorization
3. **Booking Service**: Manages service requests and scheduling
4. **Payment Service**: Processes all financial transactions
5. **Notification Service**: Handles all communications
6. **Analytics Service**: Processes and serves analytics data
7. **Document Service**: Manages file uploads and storage

## 4. Functional Requirements
### 4.1 Admin Dashboard
- **User Management**: CRUD operations for all user types
- **Analytics**: System-wide performance metrics
- **Content Management**: Manage FAQs, help docs, T&Cs
- **System Configuration**: Application settings and parameters

### 4.2 User Dashboard
- **Profile Management**: Personal information and preferences
- **Service Booking**: New service requests and history
- **Payment**: Transaction history and payment methods
- **Notifications**: In-app alerts and updates

### 4.3 Technician Dashboard
- **Job Management**: View and update assigned jobs
- **Schedule**: Availability and calendar management
- **Earnings**: Payment history and wallet balance
- **Performance**: Ratings and feedback

### 4.4 Partner/Dealer Dashboard
- **Inventory Management**: Product and service catalog
- **Order Management**: Track service requests
- **Financials**: Payouts and earnings
- **Analytics**: Performance metrics

## 5. Non-Functional Requirements
### 5.1 Performance
- **Response Time**: < 2 seconds for API responses
- **Concurrent Users**: Support for 10,000+ concurrent users
- **Uptime**: 99.99% availability
- **Data Retention**: 5 years for financial records

### 5.2 Security
- **Authentication**: JWT with refresh tokens
- **Authorization**: Role-based access control (RBAC)
- **Data Encryption**: AES-256 for data at rest, TLS 1.3 for data in transit
- **Compliance**: GDPR, CCPA, and local data protection laws
- **Audit Logging**: All sensitive operations logged

### 5.3 Scalability
- **Horizontal Scaling**: Microservices architecture
- **Database**: Sharding and replication
- **Caching**: Redis for frequently accessed data
- **Load Balancing**: Round-robin and least-connections algorithms

## 6. API Documentation
### 6.1 Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - User logout

### 6.2 Bookings
- `POST /api/bookings` - Create new booking
- `GET /api/bookings` - List bookings
- `GET /api/bookings/:id` - Get booking details
- `PUT /api/bookings/:id` - Update booking
- `DELETE /api/bookings/:id` - Cancel booking

## 7. Database Schema
### 7.1 Users Collection
```javascript
{
  _id: ObjectId,
  email: String,
  password: String,
  role: String, // 'user', 'technician', 'admin', etc.
  profile: {
    firstName: String,
    lastName: String,
    phone: String,
    avatar: String
  },
  status: String, // 'active', 'inactive', 'suspended'
  lastLogin: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### 7.2 Bookings Collection
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  technicianId: ObjectId,
  serviceId: ObjectId,
  status: String, // 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'
  schedule: {
    date: Date,
    timeSlot: String,
    endTime: Date
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    location: {
      type: { type: String },
      coordinates: [Number] // [longitude, latitude]
    }
  },
  payment: {
    amount: Number,
    status: String, // 'pending', 'paid', 'refunded'
    method: String, // 'card', 'wallet', 'cod'
    transactionId: String
  },
  rating: {
    value: Number,
    review: String,
    createdAt: Date
  },
  createdAt: Date,
  updatedAt: Date
}
```

## 8. Testing Strategy
### 8.1 Unit Testing
- Test individual components in isolation
- Achieve 80%+ code coverage
- Use Jest for JavaScript/Node.js tests

### 8.2 Integration Testing
- Test API endpoints
- Database integration tests
- Third-party service integrations

### 8.3 E2E Testing
- User flows across the application
- Cross-browser and cross-device testing
- Performance and load testing

## 9. Deployment
### 9.1 Environments
- **Development**: For active development
- **Staging**: Mirror of production for testing
- **Production**: Live environment

### 9.2 CI/CD Pipeline
1. Code commit triggers build
2. Run tests
3. Build Docker images
4. Deploy to staging for review
5. Manual approval for production
6. Automated deployment to production

## 10. Monitoring and Logging
### 10.1 Application Monitoring
- Error tracking (Sentry)
- Performance monitoring (New Relic)
- Uptime monitoring (Pingdom)

### 10.2 Logging
- Centralized logging with ELK Stack
- Log levels: error, warn, info, debug
- Retention: 30 days for debug, 1 year for errors

## 11. Security Measures
### 11.1 Authentication
- JWT with short-lived access tokens
- Secure HTTP-only cookies for refresh tokens
- Rate limiting on authentication endpoints

### 11.2 Data Protection
- Encryption at rest and in transit
- Regular security audits
- Penetration testing

## 12. Future Enhancements
- AI-powered service recommendations
- Predictive maintenance scheduling
- IoT device integration for diagnostics
- Voice assistant integration
- AR-based technician assistance

## 13. Appendix
### 13.1 Third-Party Services
- Payment Gateway: Razorpay/Stripe
- SMS: Twilio
- Email: SendGrid
- Maps: Google Maps/Mapbox
- Storage: AWS S3

### 13.2 Glossary
- **JWT**: JSON Web Token
- **API**: Application Programming Interface
- **SLA**: Service Level Agreement
- **SMS**: Short Message Service

---
*Document Version: 1.0*  
*Last Updated: June 24, 2025*
