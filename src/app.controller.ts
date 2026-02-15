import { Controller, Get, Header } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('privacy-policy')
  @Header('Content-Type', 'text/html')
  getPrivacyPolicy(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #2c3e50;
      border-bottom: 3px solid #3498db;
      padding-bottom: 10px;
      margin-bottom: 30px;
    }
    h2 {
      color: #34495e;
      margin-top: 30px;
      margin-bottom: 15px;
    }
    p {
      margin-bottom: 15px;
    }
    .last-updated {
      color: #7f8c8d;
      font-style: italic;
      margin-bottom: 30px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Privacy Policy</h1>
    <p class="last-updated">Last updated: December 2025</p>
    
    <p>This application is operated by the developer for internal use to manage and automate interactions on Meta platforms, including Facebook, Instagram, WhatsApp, and Messenger.</p>
    
    <h2>Data Collection and Use</h2>
    <p>The application may access and process limited data provided through Meta platforms, such as messages, comments, profile identifiers, and interaction metadata, solely for the purpose of responding to users, managing social interactions, and automating workflows.</p>
    <p>The application does not sell, rent, or share personal data with third parties.</p>
    
    <h2>Data Storage</h2>
    <p>Any data accessed by the application is stored only as long as necessary to provide the intended functionality and is handled using reasonable security measures.</p>
    
    <h2>Third-Party Services</h2>
    <p>This application relies on Meta's APIs and services. Use of data is subject to Meta's platform policies and terms.</p>
    
    <h2>User Rights</h2>
    <p>Users may contact the developer to request information about data handling or to request deletion of data where applicable.</p>
    
    <h2>Contact</h2>
    <p>For questions regarding this Privacy Policy, please contact:</p>
    <p>Email: administration@supernovaint.com</p>
  </div>
</body>
</html>
    `.trim();
  }
}
