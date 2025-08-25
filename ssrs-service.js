// ssrs-service.js
const axios = require('axios');
const cheerio = require('cheerio');

class SSRSService {
  constructor() {
    this.config = {
      serverUrl: '',
      reportPath: '',
      username: '',
      password: '',
      domain: '',
      useWindowsAuth: true
    };
  }

  // Configure SSRS connection
  configure(config) {
    this.config = { ...this.config, ...config };
  }

  // Get authentication headers based on configuration
  getAuthHeaders() {
    if (this.config.useWindowsAuth && this.config.username && this.config.password) {
      // For Windows Authentication, we'll use basic auth format
      const credentials = Buffer.from(`${this.config.domain ? this.config.domain + '\\' : ''}${this.config.username}:${this.config.password}`).toString('base64');
      return {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
      };
    }
    return {};
  }

  // Build SSRS report URL
  buildReportUrl(format = 'XML', parameters = {}) {
    if (!this.config.serverUrl || !this.config.reportPath) {
      throw new Error('SSRS server URL and report path must be configured');
    }

    let url = `${this.config.serverUrl}/ReportServer/Pages/ReportViewer.aspx`;
    const params = new URLSearchParams();
    
    // Add report path
    params.append('/', this.config.reportPath);
    
    // Add format
    params.append('rs:Format', format);
    
    // Add custom parameters
    Object.keys(parameters).forEach(key => {
      params.append(key, parameters[key]);
    });

    return `${url}?${params.toString()}`;
  }

  // Alternative URL for direct report execution (more reliable for automation)
  buildDirectReportUrl(format = 'XML', parameters = {}) {
    if (!this.config.serverUrl || !this.config.reportPath) {
      throw new Error('SSRS server URL and report path must be configured');
    }

    let url = `${this.config.serverUrl}/ReportServer`;
    const params = new URLSearchParams();
    
    // Add report path
    params.append('/', this.config.reportPath);
    
    // Add format and command
    params.append('rs:Format', format);
    params.append('rs:Command', 'Render');
    
    // Add custom parameters
    Object.keys(parameters).forEach(key => {
      params.append(key, parameters[key]);
    });

    return `${url}?${params.toString()}`;
  }

  // Fetch entrance time from SSRS report
  async fetchEntranceTime(employeeId = null, date = null) {
    try {
      // Default to today if no date provided
      const targetDate = date || new Date().toISOString().split('T')[0];
      
      // Build parameters
      const parameters = {};
      if (employeeId) {
        parameters['EmployeeId'] = employeeId;
      }
      if (targetDate) {
        parameters['Date'] = targetDate;
      }

      // Try XML format first (easier to parse)
      const xmlUrl = this.buildDirectReportUrl('XML', parameters);
      
      const response = await axios.get(xmlUrl, {
        headers: this.getAuthHeaders(),
        timeout: 30000, // 30 second timeout
        validateStatus: function (status) {
          return status < 500; // Accept anything under 500 as we'll handle errors
        }
      });

      if (response.status === 401) {
        throw new Error('Authentication failed. Please check your credentials.');
      }
      
      if (response.status >= 400) {
        throw new Error(`SSRS server returned error: ${response.status} ${response.statusText}`);
      }

      // Parse the response based on content type
      const contentType = response.headers['content-type'] || '';
      
      if (contentType.includes('xml')) {
        return this.parseXMLResponse(response.data);
      } else if (contentType.includes('html')) {
        return this.parseHTMLResponse(response.data);
      } else {
        // Try to parse as text/JSON
        return this.parseTextResponse(response.data);
      }
      
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to SSRS server. Please check the server URL.');
      } else if (error.code === 'ENOTFOUND') {
        throw new Error('SSRS server not found. Please check the server URL.');
      } else if (error.response?.status === 404) {
        throw new Error('Report not found. Please check the report path.');
      }
      
      throw error;
    }
  }

  // Parse XML response (most common SSRS format)
  parseXMLResponse(xmlData) {
    try {
      const $ = cheerio.load(xmlData, { xmlMode: true });
      
      // Common XML patterns for entrance time
      const timePatterns = [
        'EntranceTime',
        'StartTime', 
        'CheckInTime',
        'ArrivalTime',
        'TimeIn'
      ];
      
      for (const pattern of timePatterns) {
        const timeElement = $(pattern).first();
        if (timeElement.length > 0) {
          const timeValue = timeElement.text().trim();
          const parsedTime = this.parseTimeValue(timeValue);
          if (parsedTime) {
            return {
              success: true,
              entranceTime: parsedTime,
              source: 'XML',
              rawValue: timeValue
            };
          }
        }
      }
      
      // If no specific pattern found, look for any time-like values
      const allText = $.text();
      const timeMatches = allText.match(/\b(\d{1,2}):(\d{2})\b/g);
      if (timeMatches && timeMatches.length > 0) {
        // Return the first valid time found
        const parsedTime = this.parseTimeValue(timeMatches[0]);
        if (parsedTime) {
          return {
            success: true,
            entranceTime: parsedTime,
            source: 'XML_EXTRACTED',
            rawValue: timeMatches[0]
          };
        }
      }
      
      throw new Error('No entrance time found in XML response');
      
    } catch (error) {
      throw new Error(`Failed to parse XML response: ${error.message}`);
    }
  }

  // Parse HTML response
  parseHTMLResponse(htmlData) {
    try {
      const $ = cheerio.load(htmlData);
      
      // Look for table cells or divs that might contain time data
      const timeRegex = /\b(\d{1,2}):(\d{2})\b/g;
      const matches = htmlData.match(timeRegex);
      
      if (matches && matches.length > 0) {
        // Return the first valid time found
        const parsedTime = this.parseTimeValue(matches[0]);
        if (parsedTime) {
          return {
            success: true,
            entranceTime: parsedTime,
            source: 'HTML',
            rawValue: matches[0]
          };
        }
      }
      
      throw new Error('No entrance time found in HTML response');
      
    } catch (error) {
      throw new Error(`Failed to parse HTML response: ${error.message}`);
    }
  }

  // Parse text/other response
  parseTextResponse(textData) {
    try {
      // Look for time patterns in text
      const timeRegex = /\b(\d{1,2}):(\d{2})\b/g;
      const matches = textData.match(timeRegex);
      
      if (matches && matches.length > 0) {
        const parsedTime = this.parseTimeValue(matches[0]);
        if (parsedTime) {
          return {
            success: true,
            entranceTime: parsedTime,
            source: 'TEXT',
            rawValue: matches[0]
          };
        }
      }
      
      throw new Error('No entrance time found in response');
      
    } catch (error) {
      throw new Error(`Failed to parse response: ${error.message}`);
    }
  }

  // Parse and validate time value
  parseTimeValue(timeStr) {
    if (!timeStr) return null;
    
    // Extract time from various formats
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (!timeMatch) return null;
    
    const hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    
    // Validate time
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }
    
    // Return in HH:MM format
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // Test connection to SSRS server
  async testConnection() {
    try {
      if (!this.config.serverUrl) {
        throw new Error('Server URL is required');
      }

      const testUrl = `${this.config.serverUrl}/ReportServer`;
      const response = await axios.get(testUrl, {
        headers: this.getAuthHeaders(),
        timeout: 10000,
        validateStatus: function (status) {
          return status < 500;
        }
      });

      if (response.status === 401) {
        return { success: false, message: 'Authentication failed' };
      }
      
      if (response.status >= 400) {
        return { success: false, message: `Server error: ${response.status}` };
      }

      return { success: true, message: 'Connection successful' };
      
    } catch (error) {
      return { 
        success: false, 
        message: error.code === 'ECONNREFUSED' ? 'Cannot connect to server' : error.message 
      };
    }
  }
}

module.exports = SSRSService;
