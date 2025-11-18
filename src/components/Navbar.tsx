
import { Link } from "react-router-dom";
import { ShoppingCart, Search, Menu, User, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";

interface NavbarProps {
  cartItemCount?: number;
}

export const Navbar = ({ cartItemCount = 0 }: NavbarProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user } = useAuth();
  const cart = (() => { try { return useCart(); } catch { return null as any; } })();
  const liveCount = cart ? cart.count : cartItemCount;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black text-white border-b border-black">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2" aria-label="UNI10 Home">
            <img
              src="/uni10-logo.png"
              alt="UNI10"
              className="h-11 md:h-12 lg:h-[52px] w-auto select-none"
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-2">
            {[
              { to: "/shop", label: "Shop" },
            
              { to: "/shop/new-arrivals", label: "New Arrivals" },
              { to: "/wishlist", label: "Wishlist" },
              { to: "/contact", label: "Contact" },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="text-sm font-medium px-4 py-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
          
            {user ? (
              <>
                <Link to="/wishlist">
                  <Button variant="ghost" size="icon" className="text-white/90 hover:text-white hover:bg-white/10">
                    <Heart className="h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/account/support" className="hidden md:block">
                  <Button variant="ghost" size="sm" className="text-xs text-white/90 hover:text-white hover:bg-white/10">
                    Support
                  </Button>
                </Link>
                <Link to="/dashboard">
                  <Button variant="ghost" size="icon" className="text-white/90 hover:text-white hover:bg-white/10">
                    <User className="h-5 w-5" />
                  </Button>
                </Link>
              </>
            ) : (
              <Link to="/auth">
                <Button variant="ghost" size="icon" className="text-white/90 hover:text-white hover:bg-white/10">
                  <User className="h-5 w-5" />
                </Button>
              </Link>
            )}

            <Link to="/cart">
              <Button variant="ghost" size="icon" className="relative text-white/90 hover:text-white hover:bg-white/10">
                <ShoppingCart className="h-5 w-5" />
                {liveCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center font-bold">
                    {liveCount}
                  </span>
                )}
              </Button>
            </Link>

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-white/90 hover:text-white hover:bg-white/10"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-black bg-black">
            <div className="flex flex-col gap-1">
              {[
                { to: "/shop", label: "Shop" },
              
                { to: "/shop/new-arrivals", label: "New Arrivals" },
                { to: "/wishlist", label: "Wishlist" },
                { to: "/contact", label: "Contact" },
                ...(user ? [{ to: "/account/support", label: "Support Tickets" }] : []),
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="text-sm font-medium px-2 py-2 rounded-md text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};
