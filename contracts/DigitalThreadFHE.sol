// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DigitalThreadFHE is SepoliaConfig {
    struct ProductPhase {
        euint32 encryptedPhaseType;
        euint32 encryptedQualityData;
        euint32 encryptedProcessParams;
        uint256 timestamp;
    }

    struct ProductLifecycle {
        ProductPhase[] phases;
        euint32 encryptedProductId;
        bool isComplete;
    }

    struct PerformanceReport {
        euint32 encryptedDefectRate;
        euint32 encryptedEfficiencyScore;
        euint32 encryptedMaintenanceFlags;
    }

    uint256 public productCount;
    uint256 public reportCount;
    mapping(uint256 => ProductLifecycle) public products;
    mapping(uint256 => PerformanceReport) public reports;
    mapping(uint256 => uint256) private requestToProductId;
    mapping(uint256 => uint256) private requestToReportId;
    
    event ProductRegistered(uint256 indexed productId);
    event PhaseAdded(uint256 indexed productId, uint256 phaseIndex);
    event AnalysisCompleted(uint256 indexed reportId);
    event ReportDecrypted(uint256 indexed reportId);

    function registerProduct(euint32 productId) public {
        productCount++;
        products[productCount] = ProductLifecycle({
            phases: new ProductPhase[](0),
            encryptedProductId: productId,
            isComplete: false
        });
        emit ProductRegistered(productCount);
    }

    function addProductionPhase(
        uint256 productId,
        euint32 phaseType,
        euint32 qualityData,
        euint32 processParams
    ) public {
        require(productId <= productCount, "Invalid product");
        require(!products[productId].isComplete, "Lifecycle completed");
        
        products[productId].phases.push(ProductPhase({
            encryptedPhaseType: phaseType,
            encryptedQualityData: qualityData,
            encryptedProcessParams: processParams,
            timestamp: block.timestamp
        }));
        
        emit PhaseAdded(productId, products[productId].phases.length - 1);
    }

    function completeLifecycle(uint256 productId) public {
        require(productId <= productCount, "Invalid product");
        products[productId].isComplete = true;
    }

    function analyzeProduct(uint256 productId) public {
        require(products[productId].isComplete, "Incomplete lifecycle");
        require(products[productId].phases.length > 0, "No phases recorded");
        
        bytes32[] memory ciphertexts = new bytes32[](products[productId].phases.length * 3);
        for (uint256 i = 0; i < products[productId].phases.length; i++) {
            ciphertexts[i*3] = FHE.toBytes32(products[productId].phases[i].encryptedQualityData);
            ciphertexts[i*3+1] = FHE.toBytes32(products[productId].phases[i].encryptedProcessParams);
            ciphertexts[i*3+2] = FHE.toBytes32(products[productId].phases[i].encryptedPhaseType);
        }
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.generateReport.selector);
        requestToProductId[reqId] = productId;
    }

    function generateReport(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 productId = requestToProductId[requestId];
        require(productId != 0, "Invalid request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32[] memory phaseData = abi.decode(cleartexts, (uint32[]));
        uint32 totalDefects = 0;
        uint32 totalEfficiency = 0;
        uint32 maintenanceFlags = 0;
        
        for (uint256 i = 0; i < phaseData.length / 3; i++) {
            totalDefects += phaseData[i*3] & 0xFFFF;
            totalEfficiency += (phaseData[i*3] >> 16) & 0xFFFF;
            maintenanceFlags |= phaseData[i*3+1];
        }
        
        uint32 avgDefectRate = totalDefects / uint32(phaseData.length / 3);
        uint32 avgEfficiency = totalEfficiency / uint32(phaseData.length / 3);
        
        reportCount++;
        reports[reportCount] = PerformanceReport({
            encryptedDefectRate: FHE.asEuint32(avgDefectRate),
            encryptedEfficiencyScore: FHE.asEuint32(avgEfficiency),
            encryptedMaintenanceFlags: FHE.asEuint32(maintenanceFlags)
        });
        
        emit AnalysisCompleted(reportCount);
    }

    function requestReport(uint256 reportId) public {
        require(reportId <= reportCount, "Invalid report");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(reports[reportId].encryptedDefectRate);
        ciphertexts[1] = FHE.toBytes32(reports[reportId].encryptedEfficiencyScore);
        ciphertexts[2] = FHE.toBytes32(reports[reportId].encryptedMaintenanceFlags);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptReport.selector);
        requestToReportId[reqId] = reportId;
    }

    function decryptReport(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 reportId = requestToReportId[requestId];
        require(reportId != 0, "Invalid request");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32[] memory reportData = abi.decode(cleartexts, (uint32[]));
        emit ReportDecrypted(reportId);
    }

    function getPhaseCount(uint256 productId) public view returns (uint256) {
        return products[productId].phases.length;
    }

    function getProductStatus(uint256 productId) public view returns (bool) {
        return products[productId].isComplete;
    }
}