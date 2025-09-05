# SSRS Integration Setup Guide

## Overview
The SSRS (SQL Server Reporting Services) integration allows you to automatically fetch your entrance time from existing SSRS reports instead of manually entering it each day.

## Configuration Steps

### 1. Access SSRS Settings
- Open the Leave Time application
- Click the **"Configure"** button in the SSRS Report Configuration section
- The settings panel will expand

### 2. Required Configuration
Fill in the following fields:

**Full Report URL (optional)**: The complete link to your report
- Example: `https://reports.company.com/Reports/report/HR/AttendanceReport`
- When provided, the server URL and report path fields can be left blank

**SSRS Server URL**: The base URL of your SSRS server
- Example: `http://your-server/ReportServer`
- Example: `https://reports.company.com/ReportServer`

**Report Path**: The path to your attendance/entrance time report
- Example: `/Reports/AttendanceReport`
- Example: `/HR/EmployeeTimeTracking`

**Username**: Your domain username
- Example: `john.doe` or `COMPANY\john.doe`

**Password**: Your password for SSRS access

**Domain** (optional): Your Windows domain
- Example: `COMPANY`

**Employee ID** (optional): Your employee ID if the report requires it
- Leave empty if the report uses your Windows identity

### 3. Authentication Options
- **Use Windows Authentication**: Keep this checked for most corporate environments
- Uncheck only if your SSRS uses basic authentication

### 4. Test and Save
1. Click **"Test Connection"** to verify your settings
2. If successful, click **"Save Settings"** to store the configuration
3. Settings are saved locally and will persist between app restarts

## Usage

### Manual Fetch
1. Click the **"Fetch from SSRS"** button next to the time input
2. The app will connect to your SSRS server and extract the entrance time
3. If successful, the time will be automatically populated

### Quick Access via Tray
- Right-click the system tray icon
- Select **"Fetch from SSRS"** from the context menu
- This provides quick access without opening the main window

## Supported Report Formats

The system can parse entrance times from various SSRS report formats:

### XML Reports (Recommended)
- Looks for XML elements like: `<EntranceTime>`, `<StartTime>`, `<CheckInTime>`, `<ArrivalTime>`, `<TimeIn>`
- Most reliable format for automated parsing

### HTML Reports
- Extracts time patterns from HTML tables and content
- Works with standard SSRS web-rendered reports

### Text Reports
- Searches for time patterns in plain text format
- Fallback option for simple report formats

## Common SSRS URL Patterns

### Standard SSRS Installation
```
Server URL: http://server-name/ReportServer
Report Path: /FolderName/ReportName
```

### SSRS with Custom Port
```
Server URL: http://server-name:8080/ReportServer
Report Path: /Reports/AttendanceReport
```

### HTTPS/SSL Enabled
```
Server URL: https://reports.company.com/ReportServer
Report Path: /HR/EmployeeAttendance
```

## Troubleshooting

### Connection Issues
- **"Cannot connect to SSRS server"**: Check server URL and network connectivity
- **"Authentication failed"**: Verify username/password and domain settings
- **"Report not found"**: Check the report path is correct

### Data Parsing Issues
- **"No entrance time found"**: The report may use different field names
- Try different report formats (XML recommended)
- Contact your IT department for report structure details

### Common Solutions
1. **Verify Report Access**: Ensure you can access the report manually via browser
2. **Check Permissions**: Confirm you have read access to the report
3. **Network Connectivity**: Ensure the SSRS server is reachable from your machine
4. **Firewall Settings**: Check if corporate firewall blocks SSRS access

## Security Notes

- Credentials are stored locally on your machine
- Passwords are not encrypted in local storage
- Use dedicated service accounts if security policies require it
- Consider using Windows Authentication for better security

## Report Requirements

For best results, your SSRS report should:
- Include entrance/start time data for the current user
- Accept date parameters (defaults to today)
- Return time in HH:MM format (e.g., "08:30")
- Be accessible with your Windows credentials

## Example Report Parameters

Many SSRS reports accept these common parameters:
- `EmployeeId`: Your employee identifier
- `Date`: Target date (automatically set to today)
- `StartDate`: Beginning of date range
- `EndDate`: End of date range

The system automatically includes these parameters when available.
