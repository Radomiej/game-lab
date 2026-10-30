export const gameSpatialRuntimeFiles = {
'SpatialHash2D.java': `package engine;
import java.util.*;
/** Uniform grid broad phase with an overflow list for huge colliders. */
public final class SpatialHash2D {
 private final HashMap<Long,ArrayList<GameObject>> cells=new HashMap<>();
 private final HashMap<GameObject,ArrayList<Long>> occupied=new HashMap<>();
 private final HashMap<GameObject,double[]> bounds=new HashMap<>();
 private final HashSet<GameObject> large=new HashSet<>();
 private static int cell(double x){return (int)Math.floor(x/64);}
 private static long key(int x,int y){return ((long)x<<32)^(y&0xffffffffL);}
 public void remove(GameObject o){ArrayList<Long> keys=occupied.remove(o);if(keys!=null)for(long k:keys){ArrayList<GameObject> list=cells.get(k);list.remove(o);if(list.isEmpty())cells.remove(k);}bounds.remove(o);large.remove(o);}
 public void update(GameObject o){remove(o);double x=o.transform.x,y=o.transform.y,w=Physics2D.extent(o,true),h=Physics2D.extent(o,false);double[] b={x-w,y-h,x+w,y+h};bounds.put(o,b);int x0=cell(b[0]),y0=cell(b[1]),x1=cell(b[2]),y1=cell(b[3]);ArrayList<Long> keys=new ArrayList<>();occupied.put(o,keys);if(((long)x1-x0+1)*((long)y1-y0+1)>256){large.add(o);return;}for(int ix=x0;ix<=x1;ix++)for(int iy=y0;iy<=y1;iy++){long k=key(ix,iy);keys.add(k);cells.computeIfAbsent(k,n->new ArrayList<>()).add(o);}}
 public ArrayList<GameObject> query(double left,double top,double right,double bottom){
  HashSet<GameObject> found=new HashSet<>(large);int x0=cell(left),y0=cell(top),x1=cell(right),y1=cell(bottom);
  if(((long)x1-x0+1)*((long)y1-y0+1)>256)found.addAll(bounds.keySet());
  else for(int x=x0;x<=x1;x++)for(int y=y0;y<=y1;y++){ArrayList<GameObject> list=cells.get(key(x,y));if(list!=null)found.addAll(list);}
  ArrayList<GameObject> result=new ArrayList<>();for(GameObject o:found){double[] b=bounds.get(o);if(b[0]<=right&&b[2]>=left&&b[1]<=bottom&&b[3]>=top)result.add(o);}result.sort((a,b)->Integer.compare(a.id,b.id));return result;
 }
}
`,
};
