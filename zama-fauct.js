const { Web3 } = require('web3');
const fs = require('fs');
const path = require('path');

// Sepolia 测试网RPC端点
const sepoliaRpcEndpoints = [
    'https://eth-sepolia.g.alchemy.com/v2/demo',
    'https://rpc.sepolia.org',
    'https://ethereum-sepolia.blockpi.network/v1/rpc/public'
];

// 合约地址和函数选择器
const CONTRACT_ADDRESS = '0x3edf60dd017ace33a0220f78741b5581c385a1ba';
const FUNCTION_SELECTOR = '0x6a627842'; // 函数选择器（前4字节）

// 生成函数调用数据，将地址作为参数
function generateFunctionData(address) {
    // 确保地址格式正确
    if (!web3.utils.isAddress(address)) {
        throw new Error(`无效的地址格式: ${address}`);
    }
    
    // 使用web3.js的ABI编码功能来正确编码地址参数
    // 移除0x前缀并转换为小写
    const cleanAddress = address.replace('0x', '').toLowerCase();
    // 补齐到32字节（64个十六进制字符）- 地址参数需要左填充0
    const paddedAddress = '000000000000000000000000' + cleanAddress;
    // 组合函数选择器和参数
    const functionData = FUNCTION_SELECTOR + paddedAddress;
    
    console.log(`生成的调用数据: ${functionData}`);
    console.log(`地址参数: ${address} -> ${cleanAddress}`);
    
    return functionData;
}

let web3;

// 初始化Web3连接到Sepolia测试网
async function initializeWeb3() {
    for (const endpoint of sepoliaRpcEndpoints) {
        try {
            console.log(`尝试连接到Sepolia测试网: ${endpoint}`);
            const testWeb3 = new Web3(endpoint);
            
            // 设置超时
            const timeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('连接超时')), 5000)
            );
            
            const blockNumber = await Promise.race([
                testWeb3.eth.getBlockNumber(),
                timeout
            ]);
            
            // 验证是否连接到Sepolia (链ID 11155111)
            const chainId = await testWeb3.eth.getChainId();
            if (Number(chainId) !== 11155111) {
                console.log(`❌ 错误的链ID: ${chainId}，应该是11155111 (Sepolia)`);
                continue;
            }
            
            web3 = testWeb3;
            console.log(`✅ 成功连接到Sepolia测试网: ${endpoint}`);
            console.log(`当前区块高度: ${blockNumber}`);
            console.log(`链ID: ${chainId}`);
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
        const balanceEth = web3.utils.fromWei(balanceWei, 'ether');
        return { balanceWei, balanceEth: parseFloat(balanceEth) };
    } catch (error) {
        console.error(`获取ETH余额失败: ${error.message}`);
        return { balanceWei: '0', balanceEth: 0 };
    }
}

// 获取当前gas价格
async function getCurrentGasPrice() {
    try {
        const gasPrice = await web3.eth.getGasPrice();
        const gasPriceGwei = parseFloat(web3.utils.fromWei(gasPrice, 'gwei'));
        console.log(`当前gas价格: ${gasPriceGwei.toFixed(2)} gwei`);
        return gasPrice;
    } catch (error) {
        console.error(`获取gas价格失败: ${error.message}`);
        // 使用默认gas价格
        return web3.utils.toWei('20', 'gwei');
    }
}

// 估算合约交互的gas费用
async function estimateContractGas(fromAddress) {
    try {
        const functionData = generateFunctionData(fromAddress);
        const estimatedGas = await web3.eth.estimateGas({
            from: fromAddress,
            to: CONTRACT_ADDRESS,
            value: '0',
            data: functionData
        });
        
        // 在估算的基础上添加5%的缓冲，确保交易成功
        const gasLimit = Math.ceil(Number(estimatedGas) * 1.05);
        
        console.log(`预估gas: ${estimatedGas}`);
        console.log(`使用gas限制: ${gasLimit} (添加5%缓冲)`);
        return gasLimit;
    } catch (error) {
        console.error(`估算gas费用失败: ${error.message}`);
        // 使用更高的默认gas限制，确保交易成功
        const defaultGasLimit = 100000; // 增加到10万
        console.log(`使用默认gas限制: ${defaultGasLimit}`);
        return defaultGasLimit;
    }
}

// 检查合约是否存在
async function checkContractExists(contractAddress) {
    try {
        const code = await web3.eth.getCode(contractAddress);
        return code !== '0x';
    } catch (error) {
        console.error(`检查合约存在性失败: ${error.message}`);
        return false;
    }
}

// 执行合约交互
async function interactWithContract(privateKey, fromAddress) {
    try {
        const functionData = generateFunctionData(fromAddress);
        
        console.log(`\n开始与合约交互...`);
        console.log(`从地址: ${fromAddress}`);
        console.log(`合约地址: ${CONTRACT_ADDRESS}`);
        console.log(`调用数据: ${functionData}`);
        
        
        // 获取nonce
        const nonce = await web3.eth.getTransactionCount(fromAddress, 'pending');
        console.log(`当前nonce: ${nonce}`);
        
        // 获取当前gas价格
        const gasPrice = await getCurrentGasPrice();
        
        // 估算gas
        const gasLimit = await estimateContractGas(fromAddress);
        
        // 计算预估费用
        const estimatedFee = BigInt(gasLimit) * BigInt(gasPrice);
        const estimatedFeeEth = parseFloat(web3.utils.fromWei(estimatedFee.toString(), 'ether'));
        console.log(`预估交易费用: ${estimatedFeeEth.toFixed(8)} ETH`);
        
        // 检查余额是否足够
        const { balanceEth } = await getETHBalance(fromAddress);
        if (balanceEth < estimatedFeeEth) {
            console.log(`❌ 余额不足: ${balanceEth.toFixed(8)} ETH < ${estimatedFeeEth.toFixed(8)} ETH`);
            return null;
        }
        
        console.log(`✅ 余额检查通过: ${balanceEth.toFixed(8)} ETH >= ${estimatedFeeEth.toFixed(8)} ETH`);
        
        // 构建交易
        const transaction = {
            from: fromAddress,
            to: CONTRACT_ADDRESS,
            value: '0',
            gas: gasLimit,
            gasPrice: gasPrice,
            nonce: nonce,
            data: functionData
        };
        
        console.log(`正在签名和发送交易...`);
        
        // 签名交易
        const signedTx = await web3.eth.accounts.signTransaction(transaction, privateKey);
        
        // 发送交易
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        
        const actualFee = BigInt(receipt.gasUsed) * BigInt(gasPrice);
        const actualFeeEth = parseFloat(web3.utils.fromWei(actualFee.toString(), 'ether'));
        
        console.log(`📋 交易已提交并被处理:`);
        console.log(`交易哈希: ${receipt.transactionHash}`);
        console.log(`Gas使用: ${receipt.gasUsed}/${gasLimit} (${((Number(receipt.gasUsed) / Number(gasLimit)) * 100).toFixed(2)}%)`);
        console.log(`实际费用: ${actualFeeEth.toFixed(8)} ETH`);
        console.log(`区块号: ${receipt.blockNumber}`);

        
        return receipt;
    } catch (error) {
        console.error(`❌ 合约交互失败: ${error.message}`);
        
        // 提供更详细的错误分析
        if (error.message.includes('reverted')) {
            console.log(`🔍 分析: 合约调用被回滚，可能的原因：`);
            console.log(`   - 合约函数不存在或参数不正确`);
            console.log(`   - 合约内部逻辑拒绝了这个调用`);
            console.log(`   - 调用者没有必要的权限`);
            console.log(`   - 合约状态不符合调用条件`);
        } else if (error.message.includes('gas')) {
            console.log(`🔍 分析: Gas相关问题，尝试增加gas limit`);
        } else if (error.message.includes('nonce')) {
            console.log(`🔍 分析: Nonce问题，可能是交易重复或nonce不正确`);
        }
        return null;
    }
}

// 读取私钥文件
function readPrivateKeys(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim() !== '');
        const privateKeys = lines.map(line => line.trim());
        return privateKeys;
    } catch (error) {
        console.error(`读取私钥文件失败: ${error.message}`);
        return [];
    }
}

// 主函数
async function main() {
    console.log('开始Sepolia测试网合约交互...');
    console.log('='.repeat(60));
    
    // 初始化Web3连接
    const connected = await initializeWeb3();
    if (!connected) {
        console.error('❌ 无法连接到Sepolia测试网RPC端点');
        return;
    }
    
    // 读取私钥文件
    const privateKeysFile = path.join(__dirname, 'evm_private.txt');
    const privateKeys = readPrivateKeys(privateKeysFile);
    
    if (privateKeys.length === 0) {
        console.error('❌ 没有找到有效的私钥');
        return;
    }
    
    console.log(`\n找到 ${privateKeys.length} 个私钥，开始合约交互...\n`);
    
    let successfulInteractions = 0;
    let totalGasUsed = 0;
    let totalFeeSpent = 0;
    
    // 遍历每个私钥
    for (let i = 0; i < privateKeys.length; i++) {
        const privateKey = privateKeys[i];
        
        console.log(`\n${'='.repeat(40)}`);
        console.log(`处理私钥 [${i + 1}/${privateKeys.length}]: ${privateKey.substring(0, 10)}...${privateKey.substring(privateKey.length - 10)}`);
        
        // 获取地址
        const address = getAddressFromPrivateKey(privateKey);
        if (!address) {
            console.log(`❌ 无效的私钥，跳过`);
            continue;
        }
        
        console.log(`钱包地址: ${address}`);
        
        // 获取余额
        const { balanceEth } = await getETHBalance(address);
        console.log(`ETH余额: ${balanceEth.toFixed(8)} ETH`);
        
        // 检查余额是否足够支付gas费
        if (balanceEth < 0.001) {
            console.log(`❌ 余额太少，跳过合约交互`);
            continue;
        }
        
        // 验证地址格式（确保不是私钥）
        if (address.length !== 42) {
            console.log(`❌ 地址格式错误，长度应该是42字符，实际: ${address.length}`);
            continue;
        }
        
        console.log(`📋 准备合约交互:`);
        console.log(`  私钥: ${privateKey.substring(0, 10)}...`);
        console.log(`  地址: ${address}`);
        console.log(`  余额: ${balanceEth.toFixed(8)} ETH`);
        
        // 执行合约交互
        const receipt = await interactWithContract(privateKey, address);
        
        if (receipt) {
            successfulInteractions++;
            totalGasUsed += Number(receipt.gasUsed);
            
            // 计算实际费用
            const gasPrice = await getCurrentGasPrice();
            const actualFee = BigInt(receipt.gasUsed) * BigInt(gasPrice);
            const actualFeeEth = parseFloat(web3.utils.fromWei(actualFee.toString(), 'ether'));
            totalFeeSpent += actualFeeEth;
        }
        
        // 添加延迟，避免请求过于频繁
        if (i < privateKeys.length - 1) {
            console.log(`等待2秒后继续...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`\n📊 执行总结:`);
    console.log(`总私钥数量: ${privateKeys.length}`);
    console.log(`成功交互数量: ${successfulInteractions}`);
    console.log(`总Gas消耗: ${totalGasUsed.toLocaleString()}`);
    console.log(`总费用支出: ${totalFeeSpent.toFixed(8)} ETH`);
    console.log(`平均Gas消耗: ${successfulInteractions > 0 ? Math.round(totalGasUsed / successfulInteractions).toLocaleString() : 0}`);
    console.log(`平均费用: ${successfulInteractions > 0 ? (totalFeeSpent / successfulInteractions).toFixed(8) : 0} ETH`);
    
    console.log('\n✅ 所有合约交互完成！');
}

// 运行脚本
if (require.main === module) {
    main().catch(console.error);
} 
