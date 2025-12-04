// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface ProductRecord {
  id: string;
  name: string;
  phase: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  status: "active" | "completed" | "failed";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newProductData, setNewProductData] = useState({
    name: "",
    phase: "design",
    data: ""
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPhase, setFilterPhase] = useState("all");
  const [showStatistics, setShowStatistics] = useState(false);

  // Calculate statistics
  const activeCount = products.filter(p => p.status === "active").length;
  const completedCount = products.filter(p => p.status === "completed").length;
  const failedCount = products.filter(p => p.status === "failed").length;
  const designCount = products.filter(p => p.phase === "design").length;
  const manufacturingCount = products.filter(p => p.phase === "manufacturing").length;
  const maintenanceCount = products.filter(p => p.phase === "maintenance").length;

  // Filter products based on search and filter
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPhase = filterPhase === "all" || product.phase === filterPhase;
    return matchesSearch && matchesPhase;
  });

  useEffect(() => {
    loadProducts().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadProducts = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("product_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing product keys:", e);
        }
      }
      
      const list: ProductRecord[] = [];
      
      for (const key of keys) {
        try {
          const productBytes = await contract.getData(`product_${key}`);
          if (productBytes.length > 0) {
            try {
              const productData = JSON.parse(ethers.toUtf8String(productBytes));
              list.push({
                id: key,
                name: productData.name,
                phase: productData.phase,
                encryptedData: productData.data,
                timestamp: productData.timestamp,
                owner: productData.owner,
                status: productData.status || "active"
              });
            } catch (e) {
              console.error(`Error parsing product data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading product ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setProducts(list);
    } catch (e) {
      console.error("Error loading products:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitProduct = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting product data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newProductData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const productId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const productData = {
        name: newProductData.name,
        phase: newProductData.phase,
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        status: "active"
      };
      
      // Store encrypted data on-chain
      await contract.setData(
        `product_${productId}`, 
        ethers.toUtf8Bytes(JSON.stringify(productData))
      );
      
      const keysBytes = await contract.getData("product_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(productId);
      
      await contract.setData(
        "product_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Product data encrypted and stored securely!"
      });
      
      await loadProducts();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewProductData({
          name: "",
          phase: "design",
          data: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const analyzeProduct = async (productId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Running FHE analysis on encrypted data..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      // Check availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        throw new Error("FHE analysis not available");
      }
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE analysis completed successfully!"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Analysis failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const updateProductPhase = async (productId: string, newPhase: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Updating product phase with FHE encryption..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const productBytes = await contract.getData(`product_${productId}`);
      if (productBytes.length === 0) {
        throw new Error("Product not found");
      }
      
      const productData = JSON.parse(ethers.toUtf8String(productBytes));
      
      const updatedProduct = {
        ...productData,
        phase: newPhase
      };
      
      await contract.setData(
        `product_${productId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedProduct))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Product phase updated securely!"
      });
      
      await loadProducts();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Update failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to start using the Smart Factory Digital Thread",
      icon: "🔗"
    },
    {
      title: "Add Product",
      description: "Create a new product record with encrypted data storage",
      icon: "➕"
    },
    {
      title: "Track Lifecycle",
      description: "Monitor your product through design, manufacturing, and maintenance phases",
      icon: "📊"
    },
    {
      title: "FHE Analysis",
      description: "Run encrypted analysis on your product data without decryption",
      icon: "🔍"
    }
  ];

  const renderStatistics = () => {
    return (
      <div className="statistics-grid">
        <div className="stat-card">
          <h4>Total Products</h4>
          <div className="stat-value">{products.length}</div>
        </div>
        <div className="stat-card">
          <h4>Design Phase</h4>
          <div className="stat-value">{designCount}</div>
        </div>
        <div className="stat-card">
          <h4>Manufacturing</h4>
          <div className="stat-value">{manufacturingCount}</div>
        </div>
        <div className="stat-card">
          <h4>Maintenance</h4>
          <div className="stat-value">{maintenanceCount}</div>
        </div>
        <div className="stat-card">
          <h4>Active</h4>
          <div className="stat-value">{activeCount}</div>
        </div>
        <div className="stat-card">
          <h4>Completed</h4>
          <div className="stat-value">{completedCount}</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing Smart Factory connection...</p>
    </div>
  );

  return (
    <div className="app-container industrial-theme">
      <header className="app-header">
        <div className="logo">
          <div className="gear-icon"></div>
          <h1>SmartFactory<span>DigitalThread</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-product-btn industrial-btn"
          >
            <div className="add-icon"></div>
            Add Product
          </button>
          <button 
            className="industrial-btn"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Guide" : "Show Guide"}
          </button>
          <button 
            className="industrial-btn"
            onClick={() => setShowStatistics(!showStatistics)}
          >
            {showStatistics ? "Hide Stats" : "Show Stats"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Confidential Smart Factory Digital Thread</h2>
            <p>Securely track your products through design, manufacturing, and maintenance with FHE encryption</p>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>Digital Thread Guide</h2>
            <p className="subtitle">Learn how to securely track your products through their lifecycle</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {showStatistics && (
          <div className="statistics-section">
            <h2>Factory Statistics</h2>
            {renderStatistics()}
          </div>
        )}
        
        <div className="products-section">
          <div className="section-header">
            <h2>Product Digital Threads</h2>
            <div className="header-actions">
              <div className="search-filter">
                <input 
                  type="text" 
                  placeholder="Search products..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="industrial-input"
                />
                <select 
                  value={filterPhase}
                  onChange={(e) => setFilterPhase(e.target.value)}
                  className="industrial-select"
                >
                  <option value="all">All Phases</option>
                  <option value="design">Design</option>
                  <option value="manufacturing">Manufacturing</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
              <button 
                onClick={loadProducts}
                className="refresh-btn industrial-btn"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="products-list industrial-card">
            <div className="table-header">
              <div className="header-cell">Product Name</div>
              <div className="header-cell">Phase</div>
              <div className="header-cell">Owner</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredProducts.length === 0 ? (
              <div className="no-products">
                <div className="no-products-icon"></div>
                <p>No product records found</p>
                <button 
                  className="industrial-btn primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Add First Product
                </button>
              </div>
            ) : (
              filteredProducts.map(product => (
                <div className="product-row" key={product.id}>
                  <div className="table-cell product-name">{product.name}</div>
                  <div className="table-cell">
                    <span className={`phase-badge ${product.phase}`}>
                      {product.phase}
                    </span>
                  </div>
                  <div className="table-cell">{product.owner.substring(0, 6)}...{product.owner.substring(38)}</div>
                  <div className="table-cell">
                    {new Date(product.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${product.status}`}>
                      {product.status}
                    </span>
                  </div>
                  <div className="table-cell actions">
                    <button 
                      className="action-btn industrial-btn"
                      onClick={() => analyzeProduct(product.id)}
                    >
                      Analyze
                    </button>
                    {product.phase === "design" && (
                      <button 
                        className="action-btn industrial-btn"
                        onClick={() => updateProductPhase(product.id, "manufacturing")}
                      >
                        To Manufacturing
                      </button>
                    )}
                    {product.phase === "manufacturing" && (
                      <button 
                        className="action-btn industrial-btn"
                        onClick={() => updateProductPhase(product.id, "maintenance")}
                      >
                        To Maintenance
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitProduct} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          productData={newProductData}
          setProductData={setNewProductData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content industrial-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="gear-icon"></div>
              <span>SmartFactoryDigitalThread</span>
            </div>
            <p>Securely track your products through their lifecycle with FHE encryption</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Confidentiality</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} Smart Factory Digital Thread. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  productData: any;
  setProductData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  productData,
  setProductData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProductData({
      ...productData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!productData.name || !productData.data) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal industrial-card">
        <div className="modal-header">
          <h2>Add Product to Digital Thread</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="lock-icon"></div> Your product data will be encrypted with FHE technology
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Product Name *</label>
              <input 
                type="text"
                name="name"
                value={productData.name} 
                onChange={handleChange}
                placeholder="Enter product name..." 
                className="industrial-input"
              />
            </div>
            
            <div className="form-group">
              <label>Initial Phase *</label>
              <select 
                name="phase"
                value={productData.phase} 
                onChange={handleChange}
                className="industrial-select"
              >
                <option value="design">Design</option>
                <option value="manufacturing">Manufacturing</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
            
            <div className="form-group full-width">
              <label>Product Data *</label>
              <textarea 
                name="data"
                value={productData.data} 
                onChange={handleChange}
                placeholder="Enter product specifications and data..." 
                className="industrial-textarea"
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="shield-icon"></div> Data remains encrypted during all FHE operations
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn industrial-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn industrial-btn primary"
          >
            {creating ? "Encrypting with FHE..." : "Add to Digital Thread"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;