const { Web3 } = require('web3');
const fs = require('fs');
const path = require('path');

// 连接到ETH主网的RPC端点
const rpcEndpoints = [
    'https://ethereum.blockpi.network/v1/rpc/public',
    'https://eth-mainnet.g.alchemy.com/v2/demo',
    'https://rpc.ankr.com/eth'
];

// 目标转账地址
const TARGET_ADDRESS = '0x220511f4fd6d898125f79aa8d4cb91bffe9df6db';

let web3;
let currentGasPrice;

// 尝试连接到可用的RPC端点
async function initializeWeb3() {
    for (const endpoint of rpcEndpoints) {
        try {
            console.log(`尝试连接到: ${endpoint}`);
            const testWeb3 = new Web3(endpoint);
            
            // 设置超时
            const timeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('连接超时')), 5000)
            );
            
            const blockNumber = await Promise.race([
                testWeb3.eth.getBlockNumber(),
                timeout
            ]);
            
            web3 = testWeb3;
            console.log(`✅ 成功连接到: ${endpoint}`);
            console.log(`当前区块高度: ${blockNumber}`);
            return true;
        } catch (error) {
            console.log(`❌ 连接失败: ${endpoint} - ${error.message}`);
            continue;
        }
    }
    return false;
}

// 获取当前gas价格
async function getCurrentGasPrice() {
    try {
        const gasPrice = await web3.eth.getGasPrice();
        console.log(`当前gas价格: ${gasPrice} wei (${web3.utils.fromWei(gasPrice, 'gwei')} gwei)`);
        return gasPrice;
    } catch (error) {
        console.error(`获取gas价格失败: ${error.message}`);
        // 使用默认gas价格 20 gwei
        return web3.utils.toWei('20', 'gwei');
    }
}

// 估算转账gas费用
async function estimateTransferGas(fromAddress, toAddress, amount) {
    try {
        const gasLimit = await web3.eth.estimateGas({
            from: fromAddress,
            to: toAddress,
            value: amount
        });
        
        const totalGasCost = BigInt(gasLimit) * BigInt(currentGasPrice);
        console.log(`预估gas限制: ${gasLimit}`);
        console.log(`预估gas费用: ${web3.utils.fromWei(totalGasCost.toString(), 'ether')} ETH`);
        
        return { gasLimit, totalGasCost };
    } catch (error) {
        console.error(`估算gas费用失败: ${error.message}`);
        // 使用标准转账的gas限制
        const gasLimit = 21000;
        const totalGasCost = BigInt(gasLimit) * BigInt(currentGasPrice);
        return { gasLimit, totalGasCost };
    }
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
        return { balanceWei, balanceEth };
    } catch (error) {
        console.error(`获取ETH余额失败: ${error.message}`);
        return { balanceWei: '0', balanceEth: '0' };
    }
}

// 执行转账
async function transferETH(privateKey, fromAddress, toAddress, amount) {
    try {
        console.log(`开始转账...`);
        console.log(`从: ${fromAddress}`);
        console.log(`到: ${toAddress}`);
        console.log(`金额: ${web3.utils.fromWei(amount.toString(), 'ether')} ETH`);
        
        // 获取nonce
        const nonce = await web3.eth.getTransactionCount(fromAddress, 'pending');
        console.log(`当前nonce: ${nonce}`);
        
        // 估算gas
        const { gasLimit } = await estimateTransferGas(fromAddress, toAddress, amount);
        
        // 构建交易
        const transaction = {
            from: fromAddress,
            to: toAddress,
            value: amount.toString(),
            gas: gasLimit,
            gasPrice: currentGasPrice,
            nonce: nonce
        };
        
        // 签名交易
        const signedTx = await web3.eth.accounts.signTransaction(transaction, privateKey);
        
        // 发送交易
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        
        console.log(`✅ 转账成功!`);
        console.log(`交易哈希: ${receipt.transactionHash}`);
        console.log(`Gas使用: ${receipt.gasUsed}`);
        console.log(`区块号: ${receipt.blockNumber}`);
        
        return receipt;
    } catch (error) {
        console.error(`❌ 转账失败: ${error.message}`);
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
    console.log('开始获取ETH余额并执行转账...');
    
    // 初始化Web3连接
    const connected = await initializeWeb3();
    if (!connected) {
        console.error('❌ 无法连接到任何RPC端点');
        return;
    }
    
    // 获取当前gas价格
    currentGasPrice = await getCurrentGasPrice();
    
    // 读取私钥文件
    const privateKeysFile = path.join(__dirname, 'evm_private.txt');
    const privateKeys = readPrivateKeys(privateKeysFile);
    
    if (privateKeys.length === 0) {
        console.error('❌ 没有找到有效的私钥');
        return;
    }
    
    console.log(`\n找到 ${privateKeys.length} 个私钥，开始查询余额...\n`);
    console.log(`目标转账地址: ${TARGET_ADDRESS}\n`);
    
    let totalBalance = 0;
    let validAddresses = 0;
    let successfulTransfers = 0;
    let totalTransferred = 0;
    
    // 遍历每个私钥
    for (let i = 0; i < privateKeys.length; i++) {
        const privateKey = privateKeys[i];
        
        console.log(`\n[${i + 1}/${privateKeys.length}] 处理私钥: ${privateKey.substring(0, 10)}...`);
        
        // 获取地址
        const address = getAddressFromPrivateKey(privateKey);
        if (!address) {
            console.log('❌ 无效的私钥，跳过');
            continue;
        }
        
        console.log(`地址: ${address}`);
        
        // 获取ETH余额
        const { balanceWei, balanceEth } = await getETHBalance(address);
        const balanceNum = parseFloat(balanceEth);
        
        console.log(`ETH余额: ${balanceEth} ETH`);
        
        if (balanceNum > 0) {
            console.log(`✅ 有余额: ${balanceEth} ETH`);
            totalBalance += balanceNum;
            
            // 估算转账所需的gas费用
            const { totalGasCost } = await estimateTransferGas(address, TARGET_ADDRESS, '0');
            const gasCostEth = parseFloat(web3.utils.fromWei(totalGasCost.toString(), 'ether'));
            
            console.log(`预估gas费用: ${gasCostEth.toFixed(8)} ETH`);
            
            // 检查余额是否足够支付gas费用
            if (balanceNum > gasCostEth) {
                console.log(`💰 余额足够支付gas费用，准备转账...`);
                
                // 计算转账金额：当前余额减去gas费用
                const transferAmount = BigInt(balanceWei) - totalGasCost;
                
                if (transferAmount > 0) {
                    const transferAmountEth = web3.utils.fromWei(transferAmount.toString(), 'ether');
                    console.log(`转账金额: ${transferAmountEth} ETH (余额: ${balanceEth} ETH - gas: ${gasCostEth.toFixed(8)} ETH)`);
                    
                    // 执行转账
                    const receipt = await transferETH(privateKey, address, TARGET_ADDRESS, transferAmount);
                    
                    if (receipt) {
                        successfulTransfers++;
                        totalTransferred += parseFloat(transferAmountEth);
                        console.log(`🎉 转账完成！`);
                    }
                } else {
                    console.log(`⚠️ 计算后转账金额为0或负数`);
                }
            } else {
                console.log(`❌ 余额不足以支付gas费用 (余额: ${balanceEth} ETH, 需要gas: ${gasCostEth.toFixed(8)} ETH)`);
            }
        } else {
            console.log(`📭 无余额`);
        }
        
        validAddresses++;
        
        // 添加延迟避免请求过快
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n=== 汇总结果 ===');
    console.log(`有效地址数量: ${validAddresses}`);
    console.log(`总ETH余额: ${totalBalance.toFixed(8)} ETH`);
    console.log(`成功转账次数: ${successfulTransfers}`);
    console.log(`总转账金额: ${totalTransferred.toFixed(8)} ETH`);
    console.log(`目标地址: ${TARGET_ADDRESS}`);
    
    console.log('\n✅ 批量转账完成!');
}

// 运行主函数
main().catch(error => {
    console.error('程序执行出错:', error);
    process.exit(1);
}); 
