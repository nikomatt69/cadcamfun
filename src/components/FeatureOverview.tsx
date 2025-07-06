import { motion } from "framer-motion";
import { useRouter } from "next/router";
import { Grid3X3, Cog } from "lucide-react";
import { FileText } from "react-feather";

export default function FeatureOverview() {
  const router = useRouter();

  const features = [
    {
      icon: Grid3X3,
      title: "CAD Editor",
      description: "Advanced 2D/3D modeling with parametric design tools and constraint-based geometry",
      link: "/cad"
    },
    {
      icon: Cog,
      title: "CAM Editor", 
      description: "Generate precision toolpaths and G-code for CNC machining with advanced optimization",
      link: "/cam"
    },
    {
      icon: FileText,
      title: "Projects",
      description: "Organize and manage your designs, components, and machining operations efficiently",
      link: "/projects"
    }
  ];

  return (
    <section className="py-20 bg-gray-50 dark:bg-gray-900/50">
      <div className="container mx-auto px-6">
        <motion.div 
          className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          viewport={{ once: true }}
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              className="group bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-3xl p-8 hover:bg-white dark:hover:bg-gray-800 transition-all duration-300 cursor-pointer"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.1 }}
              viewport={{ once: true }}
              whileHover={{ scale: 1.02, y: -5 }}
              onClick={() => router.push(feature.link)}
            >
              <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <feature.icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                {feature.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
} 