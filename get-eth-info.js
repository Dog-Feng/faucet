const fs = require('fs');
const { Web3 } = require('web3');

// 使用免费的以太坊RPC节点（Infura的公共节点或其他免费节点）
// 这里使用一个免费的公共RPC节点
const web3 = new Web3('https://mainnet.infura.io/v3/0baf7b768440432a9ec455077c65384a');

// 读取EVM地址文件
function readAddressesFromFile(filename) {
    try {
        const data = fs.readFileSync(filename, 'utf8');
        return data.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
        console.error('读取文件错误:', error.message);
        return [];
    }
}

// 获取地址的ETH余额
async function getBalance(address) {
    try {
        const balance = await web3.eth.getBalance(address);
        // 将Wei转换为ETH
        const ethBalance = web3.utils.fromWei(balance, 'ether');
        return parseFloat(ethBalance);
    } catch (error) {
        console.error(`获取地址 ${address} 余额失败:`, error.message);
        return 0;
    }
}

// 获取地址的交易数量（nonce）
async function getTransactionCount(address) {
    try {
        const txCount = await web3.eth.getTransactionCount(address);
        return Number(txCount);
    } catch (error) {
        console.error(`获取地址 ${address} 交易数量失败:`, error.message);
        return 0;
    }
}

// 主函数
async function main() {
    console.log('开始处理EVM地址...\n');
    
    // 读取地址列表
    const addresses = readAddressesFromFile('EVM.txt');
    
    if (addresses.length === 0) {
        console.log('未找到有效的EVM地址');
        return;
    }
    
    console.log(`找到 ${addresses.length} 个地址\n`);
    
    // 遍历所有地址
    for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i].trim();
        
        if (!web3.utils.isAddress(address)) {
            console.log(`地址 ${address} 格式无效，跳过\n`);
            continue;
        }
        
        console.log(`正在处理地址 ${i + 1}/${addresses.length}: ${address}`);
        
        try {
            // 并行获取余额和交易数量
            const [balance, txCount] = await Promise.all([
                getBalance(address),
                getTransactionCount(address)
            ]);
            
            console.log(`  ETH余额: ${balance.toFixed(6)} ETH`);
            console.log(`  交易数量: ${txCount}`);
            console.log('─'.repeat(50));
            
        } catch (error) {
            console.error(`处理地址 ${address} 时出错:`, error.message);
        }
        
        // 添加小延迟，避免请求过于频繁
        if (i < addresses.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    console.log('\n处理完成！');
}

// 运行脚本
main().catch(console.error); 