class ApiResponse {
  constructor(statusCode, data, message = "Success") {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400; // True for success responses (2xx, 3xx), false for errors (4xx, 5xx)
  }
}

export { ApiResponse };
