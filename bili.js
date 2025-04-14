const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { ethers } = require('ethers');
const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');

const BASE_URL = 'https://billipad.finance/api';
const REFERRAL_CODE = '';
const REFERRAL_LINK = `https://Billipad.finance/ref/${REFERRAL_CODE}`;
const ACCOUNTS_FILE = 'accounts.json';
const EMAIL_DOMAIN = 'ptct.net';
const PROXIES_FILE = 'proxies.txt';

let accounts = [];
let proxies = [];

function loadProxies() {
  try {
    if (!fs.existsSync(PROXIES_FILE)) {
      console.error(`❌ ${PROXIES_FILE} not found`);
      return [];
    }
    const proxyLines = fs.readFileSync(PROXIES_FILE, 'utf8').split('\n').filter(line => line.trim());
    return proxyLines.map(line => {
      let proxy = line.trim();
      if (proxy.startsWith('http://') || proxy.startsWith('https://')) {
        proxy = proxy.replace('http://', '').replace('https://', '');
      }
      const [auth, hostPort] = proxy.includes('@') ? proxy.split('@') : ['', proxy];
      const [host, port] = hostPort.includes(':') ? hostPort.split(':') : [hostPort, ''];
      const [username, password] = auth.includes(':') ? auth.split(':') : ['', ''];
      
      if (!host || !port) {
        console.warn(`⚠️ Invalid proxy format: ${line}`);
        return null;
      }
      
      const proxyUrl = username && password 
        ? `http://${username}:${password}@${host}:${port}`
        : `http://${host}:${port}`;
      
      return proxyUrl;
    }).filter(proxy => proxy !== null);
  } catch (error) {
    console.error('❌ Error loading proxies:', error.message);
    return [];
  }
}

function getRandomProxy() {
  if (proxies.length === 0) {
    console.warn('⚠️ No valid proxies available, proceeding without proxy');
    return null;
  }
  const randomIndex = Math.floor(Math.random() * proxies.length);
  const proxy = proxies[randomIndex];
  console.log(`📍 Using proxy: ${proxy}`);
  return proxy;
}

proxies = loadProxies();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function createRandomEmail() {
  const username = `user${Math.floor(Math.random() * 10000000)}`;
  const email = `${username}@${EMAIL_DOMAIN}`;
  const password = `Pass${Math.random().toString(36).substring(2, 10)}${Math.floor(Math.random() * 100)}`;
  
  console.log(`✅ Created email: ${email}`);
  
  return {
    username,
    email,
    password,
    deviceId: uuidv4()
  };
}

function generateWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey
  };
}

function createHeaders(authToken = null, referer = 'signup') {
  const headers = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.5",
    "content-type": "application/json",
    "priority": "u=1, i",
    "sec-ch-ua": "\"Brave\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "sec-gpc": "1",
    "Referer": `https://billipad.finance/${referer}`,
    "Referrer-Policy": "strict-origin-when-cross-origin"
  };
  
  if (authToken) {
    headers.cookie = `authToken=${authToken}`;
  }
  
  return headers;
}

async function registerUser(credentials, proxy) {
  try {
    const { username, email, password, deviceId } = credentials;
    
    const config = {
      headers: createHeaders(null, 'signup?ref=' + REFERRAL_CODE),
      timeout: 15000
    };
    
    if (proxy) {
      config.httpsAgent = new HttpsProxyAgent(proxy);
    }
    
    const response = await axios.post(`${BASE_URL}/signup`, {
      username,
      email,
      password,
      deviceId,
      referralLink: REFERRAL_LINK
    }, config);
    
    console.log(`✅ Successfully registered: ${email}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Registration failed for ${credentials.email}:`, error.response?.data || error.message);
    throw error;
  }
}

async function loginUser(credentials, proxy) {
  try {
    const { email, password, deviceId } = credentials;
    
    const config = {
      headers: createHeaders(null, 'login'),
      timeout: 15000,
      withCredentials: true
    };
    
    if (proxy) {
      config.httpsAgent = new HttpsProxyAgent(proxy);
    }
    
    const response = await axios.post(`${BASE_URL}/login`, {
      email,
      password,
      deviceId
    }, config);
    
    console.log('Login data:', {
      userId: response.data.user?.id || 'none',
      hasToken: !!response.data.token
    });
    console.log('Cookies:', response.headers['set-cookie'] ? 'Present' : 'None');
    
    if (!response.data.user || !response.data.user.id) {
      throw new Error('No valid user data received');
    }
    
    let authToken = response.data.token;
    
    if (!authToken) {
      const setCookie = response.headers['set-cookie'];
      if (setCookie) {
        const cookieString = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
        const tokenMatch = cookieString.match(/authToken=([^;]+)/);
        if (tokenMatch && tokenMatch[1]) {
          authToken = tokenMatch[1];
          console.log('✅ Token from cookie');
        }
      }
    }
    
    if (!authToken) {
      console.warn('⚠️ No token found');
    }
    
    console.log(`✅ Logged in: ${email}`);
    if (authToken) {
      console.log(`✅ Token: ${authToken.substring(0, 20)}...`);
    }
    
    return {
      token: authToken || null,
      user: response.data.user
    };
  } catch (error) {
    console.error(`❌ Login failed for ${credentials.email}:`, error.response?.data || error.message);
    throw error;
  }
}

async function checkAuth(authToken, proxy) {
  try {
    const config = {
      headers: createHeaders(authToken, 'dashboard'),
      timeout: 15000,
      withCredentials: true
    };
    
    if (proxy) {
      config.httpsAgent = new HttpsProxyAgent(proxy);
    }
    
    const response = await axios.get(`${BASE_URL}/auth-check`, config);
    
    console.log('✅ Auth check OK');
    return response.data;
  } catch (error) {
    console.error('❌ Auth check failed:', error.response?.data || error.message);
    throw error;
  }
}

async function completeTask(userId, authToken, taskIndex, proxy) {
  try {
    const config = {
      headers: createHeaders(authToken, 'dashboard'),
      timeout: 15000,
      withCredentials: true
    };
    
    if (proxy) {
      config.httpsAgent = new HttpsProxyAgent(proxy);
    }
    
    const response = await axios.post(`${BASE_URL}/referral?userId=${userId}`, {
      action: 'updateTask',
      value: 10,
      taskIndex,
      clicks: 2
    }, config);
    
    console.log(`✅ Task ${taskIndex + 1} done for user: ${userId}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Task ${taskIndex + 1} failed:`, error.response?.data || error.message);
    throw error;
  }
}

async function submitWithdrawalAddress(userId, walletAddress, authToken, proxy) {
  try {
    const config = {
      headers: createHeaders(authToken, 'dashboard'),
      timeout: 15000,
      withCredentials: true
    };
    
    if (proxy) {
      config.httpsAgent = new HttpsProxyAgent(proxy);
    }
    
    const response = await axios.post(`${BASE_URL}/withdraw`, {
      userId,
      walletAddress
    }, config);
    
    console.log(`✅ Withdrawal address set for user: ${userId}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Withdrawal address failed:`, error.response?.data || error.message);
    throw error;
  }
}

function saveAccounts() {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
    console.log(`✅ Saved ${accounts.length} accounts to ${ACCOUNTS_FILE}`);
  } catch (error) {
    console.error('❌ Failed to save accounts:', error);
  }
}

async function createAccount() {
  try {
    const proxy = getRandomProxy(); 
    
    const credentials = createRandomEmail();
    console.log(`📝 Creating account: ${credentials.email}`);
    
    await registerUser(credentials, proxy);
    
    console.log('Waiting 2s...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const loginResult = await loginUser(credentials, proxy);
    const authToken = loginResult.token;
    const userId = loginResult.user.id;
    
    console.log(`📝 User ID: ${userId}`);
    
    console.log('Waiting 2s...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (authToken) {
      await checkAuth(authToken, proxy);
    } else {
      console.warn('⚠️ No token, skipping auth check');
    }
    
    for (let taskIndex = 0; taskIndex < 7; taskIndex++) {
      await completeTask(userId, authToken || '', taskIndex, proxy);
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
    }
    
    const wallet = generateWallet();
    console.log(`📝 Wallet: ${wallet.address}`);
    
    await submitWithdrawalAddress(userId, wallet.address, authToken || '', proxy);
    
    const accountData = {
      username: credentials.username,
      email: credentials.email,
      password: credentials.password,
      userId: userId,
      deviceId: credentials.deviceId,
      authToken: authToken || null,
      wallet: wallet,
      createdAt: new Date().toISOString(),
      proxy: proxy || null
    };
    
    accounts.push(accountData);
    saveAccounts();
    
    console.log(`✅ Account created: ${credentials.email}`);
    return accountData;
  } catch (error) {
    console.error('❌ Account creation failed:', error.message);
    return null;
  }
}

async function processAccounts(count) {
  console.log(`Starting ${count} accounts...`);
  
  let successful = 0;
  let failed = 0;
  
  for (let i = 0; i < count; i++) {
    console.log(`\n📝 Account ${i + 1}/${count}`);
    
    try {
      const result = await createAccount();
      if (result) {
        successful++;
        console.log(`✅ Account ${i + 1} done`);
      } else {
        failed++;
        console.log(`❌ Account ${i + 1} failed`);
      }
      
      if (i < count - 1) {
        console.log(`Waiting 5s...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error(`❌ Account ${i + 1} error:`, error.message);
      failed++;
    }
  }
  
  console.log(`\n✅ Done: ${successful} OK, ${failed} failed`);
  console.log(`📁 Saved to ${ACCOUNTS_FILE}`);
  
  return { successful, failed };
}

async function retryCreateAccounts(count, maxRetries = 3) {
  let remainingCount = count;
  let retryCount = 0;

  while (remainingCount > 0 && retryCount < maxRetries) {
    const result = await processAccounts(remainingCount);
    remainingCount -= result.successful;

    if (remainingCount > 0) {
      retryCount++;
      console.log(`\n⚠️ ${remainingCount} accounts left. Retry ${retryCount}/${maxRetries}`);
      
      if (retryCount < maxRetries) {
        const delay = 10000 + Math.floor(Math.random() * 5000);
        console.log(`Waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  if (remainingCount > 0) {
    console.log(`\n❌ Failed to create all accounts after ${maxRetries} retries`);
    console.log(`Created ${count - remainingCount}/${count}`);
  } else {
    console.log(`\n✅ All ${count} accounts created`);
  }
}

console.log('------------------------------');
console.log('Bilipad Ref - Auto Insiders');
console.log('------------------------------');

rl.question('How many accounts to create? ', async (answer) => {
  const count = parseInt(answer.trim());
  
  if (isNaN(count) || count <= 0) {
    console.error('Enter a positive number');
    rl.close();
    return;
  }
  
  await retryCreateAccounts(count);
  rl.close();
});

rl.on('close', () => {
  console.log('Done');
  process.exit(0);
});