const { Web3 } = require('web3');
const fs = require('fs');
const path = require('path');

// Sepolia 测试网RPC端点
const sepoliaRpcEndpoints = [
    'https://sepolia.infura.io/v3/0baf7b768440432a9ec455077c65384a',
    'https://eth-sepolia.g.alchemy.com/v2/demo',
    'https://rpc.sepolia.org',
    'https://ethereum-sepolia.blockpi.network/v1/rpc/public'
];

// 代币合约地址
const TOKEN_CONTRACT = '0x3edf60dd017ace33a0220f78741b5581c385a1ba';

let web3;

// 初始化Web3连接到Sepolia测试网
async function initializeWeb3() {
    for (const endpoint of sepoliaRpcEndpoints) {
        try {
            console.log(`尝试连接到Sepolia测试网: ${endpoint}`);
            const testWeb3 = new Web3(endpoint);
            
            const timeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('连接超时')), 5000)
            );
            
            const blockNumber = await Promise.race([
                testWeb3.eth.getBlockNumber(),
                timeout
            ]);
            
            const chainId = await testWeb3.eth.getChainId();
            if (Number(chainId) !== 11155111) {
                console.log(`❌ 错误的链ID: ${chainId}，应该是11155111 (Sepolia)`);
                continue;
            }
            
            web3 = testWeb3;
            console.log(`✅ 成功连接到Sepolia测试网: ${endpoint}`);
            console.log(`当前区块高度: ${blockNumber}`);
            return true;
        } catch (error) {
            console.log(`❌ 连接失败: ${endpoint} - ${error.message}`);
            continue;
        }
    }
    return false;
}

// 从私钥获取地址
function getAddressFromPrivateKey(privateKey) {
    try {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        return account.address;
    } catch (error) {
        console.error(`从私钥获取地址失败: ${error.message}`);
        return null;
    }
}

// 获取ETH余额
async function getETHBalance(address) {
    try {
        const balanceWei = await web3.eth.getBalance(address);
        const balanceEth = parseFloat(web3.utils.fromWei(balanceWei, 'ether'));
        return balanceEth;
    } catch (error) {
        console.error(`获取ETH余额失败: ${error.message}`);
        return 0;
    }
}

// 获取代币基本信息
async function getTokenInfo(contractAddress) {
    try {
        // 获取代币名称 (name)
        const nameData = '0x06fdde03'; // name() 函数选择器
        const nameResult = await web3.eth.call({
            to: contractAddress,
            data: nameData
        });
        
        // 获取代币符号 (symbol)
        const symbolData = '0x95d89b41'; // symbol() 函数选择器
        const symbolResult = await web3.eth.call({
            to: contractAddress,
            data: symbolData
        });
        
        // 获取小数位数 (decimals)
        const decimalsData = '0x313ce567'; // decimals() 函数选择器
        const decimalsResult = await web3.eth.call({
            to: contractAddress,
            data: decimalsData
        });
        
        // 解析结果
        let name = 'Unknown';
        let symbol = 'UNK';
        let decimals = 18;
        
        try {
            if (nameResult && nameResult !== '0x') {
                name = web3.utils.hexToAscii(nameResult).replace(/\0/g, '');
            }
        } catch (e) {
            console.log('无法解析代币名称');
        }
        
        try {
            if (symbolResult && symbolResult !== '0x') {
                symbol = web3.utils.hexToAscii(symbolResult).replace(/\0/g, '');
            }
        } catch (e) {
            console.log('无法解析代币符号');
        }
        
        try {
            if (decimalsResult && decimalsResult !== '0x') {
                decimals = parseInt(decimalsResult, 16);
            }
        } catch (e) {
            console.log('无法解析代币小数位，使用默认值18');
        }
        
        return { name, symbol, decimals };
    } catch (error) {
        console.error(`获取代币信息失败: ${error.message}`);
        return { name: 'Unknown Token', symbol: 'UNK', decimals: 18 };
    }
}

// 获取代币余额
async function getTokenBalance(contractAddress, holderAddress, decimals) {
    try {
        // 构建balanceOf(address)调用数据
        const functionSelector = '0x70a08231'; // balanceOf(address) 函数选择器
        const addressParam = holderAddress.replace('0x', '').toLowerCase().padStart(64, '0');
        const callData = functionSelector + addressParam;
        
        console.log(`📋 查询代币余额:`);
        console.log(`  合约地址: ${contractAddress}`);
        console.log(`  持有者地址: ${holderAddress}`);
        console.log(`  调用数据: ${callData}`);
        
        const result = await web3.eth.call({
            to: contractAddress,
            data: callData
        });
        
        if (result && result !== '0x') {
            const balanceWei = BigInt(result);
            const balanceFormatted = parseFloat(balanceWei.toString()) / Math.pow(10, decimals);
            return { raw: balanceWei.toString(), formatted: balanceFormatted };
        } else {
            return { raw: '0', formatted: 0 };
        }
    } catch (error) {
        console.error(`获取代币余额失败: ${error.message}`);
        return { raw: '0', formatted: 0 };
    }
}

// 读取私钥文件
function readPrivateKeys(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim() !== '');
        return lines.map(line => line.trim());
    } catch (error) {
        console.error(`读取私钥文件失败: ${error.message}`);
        return [];
    }
}

// 主函数
async function main() {
    console.log('🪙 开始查询Sepolia测试网代币余额...');
    console.log('='.repeat(60));
    
    // 初始化Web3连接
    const connected = await initializeWeb3();
    if (!connected) {
        console.error('❌ 无法连接到Sepolia测试网RPC端点');
        return;
    }
    
    // 获取代币基本信息
    console.log(`\n📋 获取代币信息...`);
    const tokenInfo = await getTokenInfo(TOKEN_CONTRACT);
    console.log(`代币名称: ${tokenInfo.name}`);
    console.log(`代币符号: ${tokenInfo.symbol}`);
    console.log(`小数位数: ${tokenInfo.decimals}`);
    console.log(`合约地址: ${TOKEN_CONTRACT}`);
    
    // 读取私钥文件
    const privateKeysFile = path.join(__dirname, 'evm_private.txt');
    const privateKeys = readPrivateKeys(privateKeysFile);
    
    if (privateKeys.length === 0) {
        console.error('❌ 没有找到有效的私钥');
        return;
    }
    
    console.log(`\n找到 ${privateKeys.length} 个私钥，开始查询余额...\n`);
    
    let totalTokenBalance = 0;
    let totalETHBalance = 0;
    let addressesWithTokens = 0;
    let addressesWithoutTokens = [];
    let privateKeysWithoutTokens = [];
    
    // 遍历每个私钥
    for (let i = 0; i < privateKeys.length; i++) {
        const privateKey = privateKeys[i];
        
        console.log(`\n${'='.repeat(40)}`);
        console.log(`查询地址 [${i + 1}/${privateKeys.length}]: ${privateKey.substring(0, 10)}...${privateKey.substring(privateKey.length - 10)}`);
        
        // 获取地址
        const address = getAddressFromPrivateKey(privateKey);
        if (!address) {
            console.log(`❌ 无效的私钥，跳过`);
            continue;
        }
        
        console.log(`钱包地址: ${address}`);
        
        // 获取ETH余额
        const ethBalance = await getETHBalance(address);
        console.log(`ETH余额: ${ethBalance.toFixed(8)} ETH`);
        totalETHBalance += ethBalance;
        
        // 获取代币余额
        const tokenBalance = await getTokenBalance(TOKEN_CONTRACT, address, tokenInfo.decimals);
        console.log(`${tokenInfo.symbol}余额: ${tokenBalance.formatted.toFixed(6)} ${tokenInfo.symbol}`);
        console.log(`原始余额: ${tokenBalance.raw}`);
        
        if (tokenBalance.formatted > 0) {
            addressesWithTokens++;
        } else {
            // 记录没有代币的私钥和地址
            addressesWithoutTokens.push(address);
            privateKeysWithoutTokens.push(privateKey);
            console.log(`⚪ 此地址没有${tokenInfo.symbol}代币`);
        }
        
        totalTokenBalance += tokenBalance.formatted;
        
        // 添加延迟，避免请求过于频繁
        if (i < privateKeys.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`\n📊 查询总结:`);
    console.log(`总地址数量: ${privateKeys.length}`);
    console.log(`有代币的地址: ${addressesWithTokens}`);
    console.log(`没有代币的地址: ${addressesWithoutTokens.length}`);
    console.log(`总ETH余额: ${totalETHBalance.toFixed(8)} ETH`);
    console.log(`总${tokenInfo.symbol}余额: ${totalTokenBalance.toFixed(6)} ${tokenInfo.symbol}`);
    console.log(`平均ETH余额: ${privateKeys.length > 0 ? (totalETHBalance / privateKeys.length).toFixed(8) : 0} ETH`);
    console.log(`平均${tokenInfo.symbol}余额: ${privateKeys.length > 0 ? (totalTokenBalance / privateKeys.length).toFixed(6) : 0} ${tokenInfo.symbol}`);
    
    if (addressesWithTokens > 0) {
        console.log(`💰 有代币地址的平均余额: ${(totalTokenBalance / addressesWithTokens).toFixed(6)} ${tokenInfo.symbol}`);
    }
    
    // 输出没有代币的私钥列表
    if (privateKeysWithoutTokens.length > 0) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`\n⚪ 没有${tokenInfo.symbol}代币的私钥列表 (${privateKeysWithoutTokens.length}个):`);
        console.log(`${'='.repeat(60)}`);
        
        for (let i = 0; i < privateKeysWithoutTokens.length; i++) {
            const privateKey = privateKeysWithoutTokens[i];
            const address = addressesWithoutTokens[i];
            console.log(`${i + 1}. ${privateKey}`);
            console.log(`   地址: ${address}`);
            console.log(`   代币余额: 0 ${tokenInfo.symbol}`);
            console.log('');
        }
        
        console.log(`总计: ${privateKeysWithoutTokens.length} 个私钥没有${tokenInfo.symbol}代币`);
    } else {
        console.log(`\n🎉 所有地址都有${tokenInfo.symbol}代币！`);
    }
    
    console.log('\n✅ 代币余额查询完成！');
}

// 运行脚本
if (require.main === module) {
    main().catch(console.error);
} 